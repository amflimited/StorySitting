import Combine
import Foundation
import Security
import StorySittingCore

@MainActor
final class AccountSession: ObservableObject {
    enum Step { case email, code }

    @Published private(set) var isAuthenticated: Bool
    @Published var step: Step = .email
    @Published var email = ""
    @Published var code = ""
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    private let api: ProductionStorySittingAPI

    init(api: ProductionStorySittingAPI, hasStoredToken: Bool) {
        self.api = api
        self.isAuthenticated = hasStoredToken
    }

    func requestCode() async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await api.requestSignInCode(email: email)
            step = .code
        } catch {
            errorMessage = friendly(error)
        }
    }

    func verifyCode() async -> Bool {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let result = try await api.verifySignInCode(email: email, code: code)
            try SecureStorySittingToken.save(result.token)
            isAuthenticated = true
            return true
        } catch {
            errorMessage = friendly(error)
            return false
        }
    }

    func useDifferentEmail() {
        code = ""
        step = .email
        errorMessage = nil
    }

    func signOut() async {
        isWorking = true
        await api.signOut()
        SecureStorySittingToken.clear()
        code = ""
        step = .email
        isAuthenticated = false
        isWorking = false
    }

    private func friendly(_ error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? "Something got in the way. Please try again."
    }
}

enum SecureStorySittingToken {
    private static let service = "com.amflimited.storysitting.account"
    private static let account = "production-session"

    static func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) throws {
        clear()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: Data(token.utf8),
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw StorySittingAPIError.invalidRequest("The secure account token could not be saved on this iPhone.")
        }
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
