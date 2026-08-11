import SwiftUI
import StorySittingCore

@main
struct StorySittingApp: App {
    @StateObject private var model: AppModel
    @StateObject private var account: AccountSession
    @StateObject private var store = StoreService()

    init() {
        let token = SecureStorySittingToken.read()
        let api = ProductionStorySittingAPI(accessToken: token)
        _model = StateObject(wrappedValue: AppModel(api: api))
        _account = StateObject(wrappedValue: AccountSession(api: api, hasStoredToken: token != nil))
    }

    var body: some Scene {
        WindowGroup {
            AccountGateView()
                .environmentObject(model)
                .environmentObject(account)
                .environmentObject(store)
                .tint(StoryTheme.recorderTeal)
                .preferredColorScheme(.light)
        }
    }
}
