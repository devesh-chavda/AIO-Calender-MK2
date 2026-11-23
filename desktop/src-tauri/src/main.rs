// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    {
        let current_args = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        if !current_args.contains("ElasticOverscroll") {
            let flag = "--disable-features=ElasticOverscroll";
            let new_args = if current_args.trim().is_empty() {
                flag.to_string()
            } else {
                format!("{} {}", current_args, flag)
            };
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", new_args);
        }
    }

    aio_calender_mk2_lib::run();
}
