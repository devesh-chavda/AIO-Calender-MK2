use std::fs;
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
            let quit_i = MenuItem::with_id(app, "quit", "Exit Application", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_i, &quit_i])?;

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
            send_desktop_notification
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
