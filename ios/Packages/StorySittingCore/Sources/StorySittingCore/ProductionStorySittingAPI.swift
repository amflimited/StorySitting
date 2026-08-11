#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Foundation

public struct StorySittingAccountSnapshot: Codable, Equatable, Sendable {
    public let apiVersion: Int
    public let organizer: FamilyOrganizer
    public let projects: [StoryProject]
}

public struct StorySittingSignIn: Codable, Equatable, Sendable {
    public let token: String
    public let expiresIn: Int
    public let account: StorySittingAccountSnapshot
}

public protocol StorySittingAccountAPI: StorySittingAPI {
    func requestSignInCode(email: String) async throws
    func verifySignInCode(email: String, code: String) async throws -> StorySittingSignIn
    func setAccessToken(_ token: String?) async
    func signOut() async
}

public actor ProductionStorySittingAPI: StorySittingAccountAPI {
    private struct CodeRequest: Encodable { let email: String }
    private struct CodeVerification: Encodable { let email: String; let code: String }
    private struct QuestionSelection: Encodable { let selectedIDs: [String] }
    private struct NewQuestion: Encodable { let prompt: String; let category: String }
    private struct APIErrorEnvelope: Decodable { let error: String? }

    private let baseURL: URL
    private let session: URLSession
    private var accessToken: String?
    private var cachedAccount: StorySittingAccountSnapshot?

    public init(
        baseURL: URL = URL(string: "https://storysitting.com")!,
        accessToken: String? = nil,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.session = session
    }

    public func requestSignInCode(email: String) async throws {
        let clean = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard clean.contains("@"), clean.count <= 254 else {
            throw StorySittingAPIError.invalidRequest("Enter a valid email address.")
        }
        let _: EmptyResponse = try await send(
            path: "/api/v1/auth/request-code",
            method: "POST",
            body: CodeRequest(email: clean),
            authenticated: false,
            acceptedStatus: [202]
        )
    }

    public func verifySignInCode(email: String, code: String) async throws -> StorySittingSignIn {
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cleanCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleanCode.count == 6, cleanCode.allSatisfy(\.isNumber) else {
            throw StorySittingAPIError.invalidRequest("Enter the six digits from your email.")
        }
        let result: StorySittingSignIn = try await send(
            path: "/api/v1/auth/verify-code",
            method: "POST",
            body: CodeVerification(email: cleanEmail, code: cleanCode),
            authenticated: false
        )
        accessToken = result.token
        cachedAccount = result.account
        return result
    }

    public func setAccessToken(_ token: String?) {
        accessToken = token
        cachedAccount = nil
    }

    public func signOut() async {
        if accessToken != nil {
            let _: EmptyResponse? = try? await send(
                path: "/api/v1/auth/logout",
                method: "POST",
                body: Optional<CodeRequest>.none,
                acceptedStatus: [204]
            )
        }
        accessToken = nil
        cachedAccount = nil
    }

    public func organizer() async throws -> FamilyOrganizer {
        try await account().organizer
    }

    public func shelf() async throws -> [StoryProject] {
        try await account(forceRefresh: true).projects
    }

    public func project(id: String) async throws -> StoryProject {
        let project: StoryProject = try await send(path: "/api/v1/projects/\(escaped(id))")
        replaceCached(project)
        return project
    }

    public func updateQuestionSelection(projectID: String, selectedIDs: Set<String>) async throws -> StoryProject {
        let project: StoryProject = try await send(
            path: "/api/v1/projects/\(escaped(projectID))/questions/selection",
            method: "POST",
            body: QuestionSelection(selectedIDs: selectedIDs.sorted())
        )
        replaceCached(project)
        return project
    }

    public func addQuestion(
        projectID: String,
        prompt: String,
        category: FamilyQuestion.Category
    ) async throws -> StoryProject {
        let project: StoryProject = try await send(
            path: "/api/v1/projects/\(escaped(projectID))/questions",
            method: "POST",
            body: NewQuestion(prompt: prompt, category: category.rawValue)
        )
        replaceCached(project)
        return project
    }

    public func createPurchaseIntent(_ request: PurchaseIntentRequest) async throws -> PurchaseIntent {
        try await send(path: "/api/v1/purchases/intents", method: "POST", body: request)
    }

    public func fulfillPurchase(_ payload: VerifiedPurchasePayload) async throws -> StoryProject {
        let project: StoryProject = try await send(path: "/api/v1/purchases/fulfill", method: "POST", body: payload)
        replaceCached(project)
        return project
    }

    private func account(forceRefresh: Bool = false) async throws -> StorySittingAccountSnapshot {
        if !forceRefresh, let cachedAccount { return cachedAccount }
        let loaded: StorySittingAccountSnapshot = try await send(path: "/api/v1/account")
        cachedAccount = loaded
        return loaded
    }

    private func replaceCached(_ project: StoryProject) {
        guard var account = cachedAccount else { return }
        if let index = account.projects.firstIndex(where: { $0.id == project.id }) {
            account = StorySittingAccountSnapshot(
                apiVersion: account.apiVersion,
                organizer: account.organizer,
                projects: account.projects.enumerated().map { $0.offset == index ? project : $0.element }
            )
        }
        cachedAccount = account
    }

    private func escaped(_ component: String) -> String {
        component.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? component
    }

    private struct EmptyResponse: Codable, Equatable, Sendable {}

    private func send<Response: Decodable>(
        path: String,
        method: String = "GET",
        body: (any Encodable)? = nil,
        authenticated: Bool = true,
        acceptedStatus: Set<Int> = [200]
    ) async throws -> Response {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw StorySittingAPIError.invalidRequest("The StorySitting server address is invalid.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if authenticated {
            guard let accessToken, !accessToken.isEmpty else {
                throw StorySittingAPIError.invalidRequest("Sign in to open your Story Shelf.")
            }
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try Self.encoder.encode(AnyEncodable(body))
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw StorySittingAPIError.invalidRequest("StorySitting returned an invalid response.")
        }
        guard acceptedStatus.contains(http.statusCode) else {
            if http.statusCode == 401 {
                throw StorySittingAPIError.invalidRequest("Your sign-in expired. Sign in again to continue.")
            }
            let envelope = try? Self.decoder.decode(APIErrorEnvelope.self, from: data)
            let readable = (envelope?.error ?? "server_error").replacingOccurrences(of: "_", with: " ")
            throw StorySittingAPIError.invalidRequest(readable.capitalized + ".")
        }
        if Response.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! Response
        }
        if Response.self == EmptyResponse.self {
            return EmptyResponse() as! Response
        }
        return try Self.decoder.decode(Response.self, from: data)
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

private struct AnyEncodable: Encodable {
    private let encodeValue: (Encoder) throws -> Void

    init(_ value: any Encodable) {
        encodeValue = value.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeValue(encoder)
    }
}
