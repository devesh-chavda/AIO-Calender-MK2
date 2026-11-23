use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DesktopSettings {
    pub minimize_to_tray: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct SavedConfig {
    minimize_to_tray: bool,
}

pub struct AppState {
    pub minimize_to_tray: AtomicBool,
    pub config_file: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthTokens {
    pub id_token: String,
    pub access_token: Option<String>,
}

#[cfg(windows)]
#[link(name = "bcrypt")]
extern "system" {
    fn BCryptGenRandom(
        h_algorithm: *mut std::ffi::c_void,
        pb_buffer: *mut u8,
        cb_buffer: u32,
        dw_flags: u32,
    ) -> i32;
}

fn generate_csrf_state() -> String {
    #[cfg(windows)]
    {
        let mut bytes = [0u8; 16];
        let status = unsafe {
            BCryptGenRandom(
                std::ptr::null_mut(),
                bytes.as_mut_ptr(),
                bytes.len() as u32,
                0x00000002, // BCRYPT_USE_SYSTEM_PREFERRED_RNG
            )
        };
        if status == 0 {
            return bytes.iter().map(|b| format!("{:02x}", b)).collect();
        }
    }
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:032x}", nanos)
}

fn url_decode(input: &str) -> String {
    let mut result = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                result.push(byte);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            result.push(b' ');
            i += 1;
            continue;
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).into_owned()
}

#[tauri::command]
async fn start_system_browser_auth(app: tauri::AppHandle) -> Result<AuthTokens, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("Failed to bind local loopback listener: {}", e))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let state = generate_csrf_state();

        let auth_url = format!(
            "https://aio-calender-mk2.vercel.app/desktop-auth.html?port={}&state={}",
            port, state
        );

        // Open system default browser
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let _ = std::process::Command::new("rundll32")
                .args(["url.dll,FileProtocolHandler", &auth_url])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
        }
        #[cfg(not(windows))]
        {
            let _ = std::process::Command::new("xdg-open").arg(&auth_url).spawn();
        }

        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let start_time = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(120);

        let mut received_tokens: Option<AuthTokens> = None;

        while start_time.elapsed() < timeout {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                    let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(5)));

                    let mut buffer = [0u8; 16384];
                    let mut total_read = 0;
                    while total_read < buffer.len() {
                        match stream.read(&mut buffer[total_read..]) {
                            Ok(0) => break,
                            Ok(n) => {
                                total_read += n;
                                if buffer[..total_read].windows(4).any(|w| w == b"\r\n\r\n") {
                                    break;
                                }
                            }
                            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                                break;
                            }
                            Err(_) => break,
                        }
                    }

                    let request_str = String::from_utf8_lossy(&buffer[..total_read]);
                    let first_line = request_str.lines().next().unwrap_or("");
                    let parts: Vec<&str> = first_line.split_whitespace().collect();
                    if parts.len() < 2 {
                        continue;
                    }
                    let method = parts[0];
                    let path = parts[1];

                    // Handle CORS preflight options request
                    if method == "OPTIONS" {
                        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n";
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    // Favicon requests
                    if path.starts_with("/favicon") {
                        let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    if !path.starts_with("/callback?") && path != "/callback" {
                        let resp = "HTTP/1.1 400 Bad Request\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    // Parse query parameters
                    let query_str = path.split_once('?').map(|x| x.1).unwrap_or("");
                    let mut param_state = None;
                    let mut param_id_token = None;
                    let mut param_access_token = None;
                    let mut param_error = None;

                    for pair in query_str.split('&') {
                        if pair.is_empty() { continue; }
                        let (k, v) = match pair.split_once('=') {
                            Some((k, v)) => (k, v),
                            None => (pair, ""),
                        };
                        let val = url_decode(v);
                        match k {
                            "state" => param_state = Some(val),
                            "idToken" | "id_token" => param_id_token = Some(val),
                            "accessToken" | "access_token" => param_access_token = Some(val),
                            "error" => param_error = Some(val),
                            _ => {}
                        }
                    }

                    // Anti-CSRF verification
                    if param_state.as_deref() != Some(&state) {
                        let body = "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0f172a;color:#f87171;text-align:center;padding:50px;'><h2>Security Error</h2><p>CSRF state parameter mismatch. Authorization rejected.</p></body></html>";
                        let resp = format!(
                            "HTTP/1.1 403 Forbidden\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.as_bytes().len(),
                            body
                        );
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        // Non-matching state does not kill listener; continue waiting for legitimate callback
                        continue;
                    }

                    if let Some(err) = param_error {
                        let body = format!("<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0f172a;color:#f87171;text-align:center;padding:50px;'><h2>Authentication Error</h2><p>{}</p></body></html>", err);
                        let resp = format!(
                            "HTTP/1.1 400 Bad Request\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.as_bytes().len(),
                            body
                        );
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        return Err(format!("Browser authentication error: {}", err));
                    }

                    let id_token = param_id_token.unwrap_or_default();
                    let access_token = param_access_token.filter(|s| !s.is_empty());

                    if id_token.is_empty() && access_token.is_none() {
                        let body = "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0f172a;color:#f87171;text-align:center;padding:50px;'><h2>Missing Token</h2><p>No authorization tokens received from sign-in.</p></body></html>";
                        let resp = format!(
                            "HTTP/1.1 400 Bad Request\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.as_bytes().len(),
                            body
                        );
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    let body = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIO Calender MK2 - Sign-in Complete</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f172a;
      color: #f8fafc;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .card {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 1.25rem;
      padding: 2.5rem 2rem;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .icon-wrap {
      width: 4rem;
      height: 4rem;
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid rgba(34, 197, 94, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem auto;
      color: #4ade80;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      margin-bottom: 0.5rem;
      color: #ffffff;
    }
    p {
      color: #94a3b8;
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 1.75rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.25);
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.4rem 0.85rem;
      border-radius: 9999px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
    </div>
    <h1>Sign-in Successful!</h1>
    <p>You have authenticated with AIO Calender MK2. You may now close this browser tab and return to the application.</p>
    <div class="badge">
      <span>&#10003; Return to AIO Calender MK2</span>
    </div>
  </div>
  <script>
    setTimeout(() => {
      try { window.close(); } catch (e) {}
    }, 1200);
  </script>
</body>
</html>"#;

                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.as_bytes().len(),
                        body
                    );
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.flush();

                    // Restore & focus main desktop window
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_always_on_top(true);
                        let _ = window.set_focus();
                        let _ = window.set_always_on_top(false);
                    }

                    received_tokens = Some(AuthTokens {
                        id_token,
                        access_token,
                    });
                    break;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::ConnectionAborted
                    || e.kind() == std::io::ErrorKind::Interrupted => {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(e) => {
                    return Err(format!("Socket accept error: {}", e));
                }
            }
        }

        match received_tokens {
            Some(tokens) => Ok(tokens),
            None => Err("Sign-in timed out after 120 seconds. Please try again.".to_string()),
        }
    })
    .await
    .map_err(|e| format!("Authentication task failed: {}", e))?
}

#[tauri::command]
fn get_desktop_settings(
    state: State<'_, AppState>,
) -> Result<DesktopSettings, String> {
    let minimize_to_tray = state.minimize_to_tray.load(Ordering::SeqCst);
    Ok(DesktopSettings {
        minimize_to_tray,
    })
}

#[tauri::command]
fn set_minimize_to_tray(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    state.minimize_to_tray.store(enabled, Ordering::SeqCst);
    let config = SavedConfig {
        minimize_to_tray: enabled,
    };
    if let Ok(json) = serde_json::to_string_pretty(&config) {
        let _ = fs::write(&state.config_file, json);
    }
    Ok(())
}

#[tauri::command]
fn send_desktop_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let _ = fs::create_dir_all(&config_dir);
            let config_file = config_dir.join("desktop-config.json");

            let mut initial_minimize_to_tray = true;
            if config_file.exists() {
                if let Ok(content) = fs::read_to_string(&config_file) {
                    if let Ok(saved) = serde_json::from_str::<SavedConfig>(&content) {
                        initial_minimize_to_tray = saved.minimize_to_tray;
                    }
                }
            }

            app.manage(AppState {
                minimize_to_tray: AtomicBool::new(initial_minimize_to_tray),
                config_file,
            });

            let show_i = MenuItem::with_id(app, "show", "Open AIO Calender MK2", true, None::<&str>)?;
            let reload_i = MenuItem::with_id(app, "reload", "Reload / Back to App", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Exit Application", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_i, &reload_i, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false);

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                        | TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        } => {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "reload" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.eval("window.location.reload()");
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.minimize_to_tray.load(Ordering::SeqCst) {
                    let _ = window.hide();
                    api.prevent_close();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_desktop_settings,
            set_minimize_to_tray,
            send_desktop_notification,
            start_system_browser_auth
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_csrf_state_length_and_uniqueness() {
        let s1 = generate_csrf_state();
        let s2 = generate_csrf_state();
        assert_eq!(s1.len(), 32);
        assert_eq!(s2.len(), 32);
        assert_ne!(s1, s2);
        assert!(s1.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(s2.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_url_decode() {
        assert_eq!(url_decode("hello%20world"), "hello world");
        assert_eq!(url_decode("a+b+c"), "a b c");
        assert_eq!(url_decode("token%3D%3D"), "token==");
        assert_eq!(url_decode("no_special"), "no_special");
        assert_eq!(url_decode("%2F%3F%26%3D"), "/?&=");
        assert_eq!(url_decode("trailing%"), "trailing%");
        assert_eq!(url_decode("trailing%2"), "trailing%2");
        assert_eq!(url_decode("%C3%A9"), "é");
    }

    #[test]
    fn test_query_parsing_and_token_extraction() {
        let path = "/callback?idToken=test_id_token&accessToken=test_access_token&state=test_state_123";
        let query_str = path.split_once('?').map(|x| x.1).unwrap_or("");
        let mut param_state = None;
        let mut param_id_token = None;
        let mut param_access_token = None;

        for pair in query_str.split('&') {
            if pair.is_empty() { continue; }
            let (k, v) = match pair.split_once('=') {
                Some((k, v)) => (k, v),
                None => (pair, ""),
            };
            let val = url_decode(v);
            match k {
                "state" => param_state = Some(val),
                "idToken" | "id_token" => param_id_token = Some(val),
                "accessToken" | "access_token" => param_access_token = Some(val),
                _ => {}
            }
        }

        assert_eq!(param_state.as_deref(), Some("test_state_123"));
        assert_eq!(param_id_token.as_deref(), Some("test_id_token"));
        assert_eq!(param_access_token.as_deref(), Some("test_access_token"));
    }

    #[test]
    fn test_loopback_socket_communication_end_to_end() {
        use std::io::{Read, Write};
        use std::net::{TcpListener, TcpStream};

        let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind test listener");
        let port = listener.local_addr().unwrap().port();
        listener.set_nonblocking(true).unwrap();

        let state = "expected_csrf_state_nonce_123456";

        // Spawn client simulation in background thread
        let client_thread = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(50));
            let mut client = TcpStream::connect(format!("127.0.0.1:{}", port))
                .expect("Failed to connect client to loopback");
            
            let request = format!(
                "GET /callback?idToken=valid_jwt_id_token_xyz&accessToken=valid_oauth_access_token_abc&state={} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
                state, port
            );
            client.write_all(request.as_bytes()).expect("Failed to write request");
            client.flush().unwrap();

            let mut response = String::new();
            client.read_to_string(&mut response).expect("Failed to read response");
            response
        });

        // Server accept & handle loop
        let start = std::time::Instant::now();
        let mut handled = false;
        let mut received_id = String::new();
        let mut received_access = String::new();

        while start.elapsed() < std::time::Duration::from_secs(5) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream.set_nonblocking(false).unwrap();
                    stream.set_read_timeout(Some(std::time::Duration::from_secs(2))).unwrap();
                    stream.set_write_timeout(Some(std::time::Duration::from_secs(2))).unwrap();

                    let mut buffer = [0u8; 4096];
                    let mut total_read = 0;
                    while total_read < buffer.len() {
                        match stream.read(&mut buffer[total_read..]) {
                            Ok(0) => break,
                            Ok(n) => {
                                total_read += n;
                                if buffer[..total_read].windows(4).any(|w| w == b"\r\n\r\n") {
                                    break;
                                }
                            }
                            Err(_) => break,
                        }
                    }

                    let request_str = String::from_utf8_lossy(&buffer[..total_read]);
                    let first_line = request_str.lines().next().unwrap_or("");
                    let parts: Vec<&str> = first_line.split_whitespace().collect();
                    assert!(parts.len() >= 2);
                    let path = parts[1];

                    let query_str = path.split_once('?').map(|x| x.1).unwrap_or("");
                    for pair in query_str.split('&') {
                        let (k, v) = match pair.split_once('=') {
                            Some((k, v)) => (k, v),
                            None => (pair, ""),
                        };
                        let val = url_decode(v);
                        match k {
                            "idToken" => received_id = val,
                            "accessToken" => received_access = val,
                            _ => {}
                        }
                    }

                    let resp = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK";
                    stream.write_all(resp.as_bytes()).unwrap();
                    stream.flush().unwrap();
                    handled = true;
                    break;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                Err(e) => panic!("Accept error: {}", e),
            }
        }

        assert!(handled, "Server should have handled the callback request");
        assert_eq!(received_id, "valid_jwt_id_token_xyz");
        assert_eq!(received_access, "valid_oauth_access_token_abc");

        let response = client_thread.join().expect("Client thread failed");
        assert!(response.starts_with("HTTP/1.1 200 OK"));
        assert!(response.ends_with("OK"));
    }
}
