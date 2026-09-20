//! CAD Wizard desktop shell. It only hosts the web build and exposes native
//! file dialogs and file access; all CAD logic lives in the web packages.
//! No network access, telemetry or auto-update (CLAUDE.md guardrail 12).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running CAD Wizard");
}
