import SwiftUI
import StorySittingCore

@main
struct StorySittingApp: App {
    @StateObject private var model = AppModel(api: MockStorySittingAPI())
    @StateObject private var store = StoreService()

    var body: some Scene {
        WindowGroup {
            AppShellView()
                .environmentObject(model)
                .environmentObject(store)
                .tint(StoryTheme.recorderTeal)
                .preferredColorScheme(.light)
        }
    }
}
