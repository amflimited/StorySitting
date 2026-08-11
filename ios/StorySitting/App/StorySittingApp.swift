import SwiftUI
import StorySittingCore

@main
struct StorySittingApp: App {
    @StateObject private var model: AppModel
    @StateObject private var account: AccountSession
    @StateObject private var store = StoreService()
    private let screenshotMode: String?

    init() {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        let screenshotIndex = arguments.firstIndex(of: "-StorySittingScreenshot")
        let requestedScreenshotMode = screenshotIndex.flatMap { index in
            arguments.indices.contains(index + 1) ? arguments[index + 1] : "shelf"
        }
        #else
        let requestedScreenshotMode: String? = nil
        #endif

        let token = SecureStorySittingToken.read()
        let productionAPI = ProductionStorySittingAPI(accessToken: token)
        let modelAPI: any StorySittingAPI = requestedScreenshotMode == nil
            ? productionAPI
            : MockStorySittingAPI()
        screenshotMode = requestedScreenshotMode
        _model = StateObject(wrappedValue: AppModel(api: modelAPI))
        _account = StateObject(wrappedValue: AccountSession(api: productionAPI, hasStoredToken: token != nil))
    }

    var body: some Scene {
        WindowGroup {
            rootView
                .environmentObject(model)
                .environmentObject(account)
                .environmentObject(store)
                .tint(StoryTheme.recorderTeal)
        }
    }

    @ViewBuilder
    private var rootView: some View {
        #if DEBUG
        if let screenshotMode {
            AppStoreScreenshotRoot(mode: screenshotMode)
        } else {
            AccountGateView()
        }
        #else
        AccountGateView()
        #endif
    }
}
