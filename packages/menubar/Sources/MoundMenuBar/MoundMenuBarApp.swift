import SwiftUI

@main
struct MoundMenuBarApp: App {
    @StateObject private var store = AgendaStore()

    var body: some Scene {
        MenuBarExtra {
            AgendaView(store: store)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "baseball")
                Text(store.badge)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
            }
        }
        .menuBarExtraStyle(.window)
    }
}
