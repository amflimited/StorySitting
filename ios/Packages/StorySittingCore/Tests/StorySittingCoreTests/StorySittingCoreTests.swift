import XCTest
@testable import StorySittingCore

final class StorySittingCoreTests: XCTestCase {
    func testAppAccountBelongsToTheFamilyOrganizer() async {
        let organizer = await MockStorySittingAPI().organizer()
        XCTAssertEqual(organizer.name, "Maya Bennett")
        XCTAssertEqual(organizer.role, .grandchild)
    }

    func testCanonicalPayForResultEconomicsHaveNoSubscription() {
        XCTAssertEqual(StoryPurchase.allCases.count, 7)
        XCTAssertEqual(StoryPurchase.storyStart.priceCents, 500)
        XCTAssertEqual(StoryPurchase.voiceEdition.priceCents, 3_900)
        XCTAssertEqual(StoryPurchase.storyEdition.priceCents, 7_900)
        XCTAssertEqual(StoryPurchase.heirloomEdition.priceCents, 14_900)
        XCTAssertEqual(StoryPurchase.voiceToStory.priceCents, 4_000)
        XCTAssertEqual(StoryPurchase.storyToHeirloom.priceCents, 7_000)
        XCTAssertNotEqual(StoryPurchase.storyStart.productID, StoryPurchase.storyEdition.productID)
        XCTAssertTrue(StoryPurchase.voiceEdition.detail.localizedCaseInsensitiveContains("after preview"))
        XCTAssertFalse(StoryPurchase.allCases.contains { $0.productID.localizedCaseInsensitiveContains("subscription") })
    }

    func testSafeHandshakePrecedesSchedulingAndInterviewConsent() {
        let call = StoryFixtures.evelyn(referenceDate: Date(timeIntervalSince1970: 1_786_400_000)).calls[1]
        let identifiers = call.timeline.map(\.id)

        XCTAssertLessThan(identifiers.firstIndex(of: "family-pass-response")!, identifiers.firstIndex(of: "managed-human-permission")!)
        XCTAssertLessThan(identifiers.firstIndex(of: "managed-human-permission")!, identifiers.firstIndex(of: "scheduled")!)
        XCTAssertLessThan(identifiers.firstIndex(of: "scheduled")!, identifiers.firstIndex(of: "interview-consent")!)
        XCTAssertLessThan(identifiers.firstIndex(of: "interview-consent")!, identifiers.firstIndex(of: "conversation")!)
        XCTAssertLessThan(identifiers.firstIndex(of: "preview")!, identifiers.firstIndex(of: "delivery")!)
        XCTAssertEqual(call.timeline.first(where: { $0.id == "family-pass-response" })?.state, .complete)
        XCTAssertEqual(call.timeline.first(where: { $0.id == "managed-human-permission" })?.state, .complete)
        XCTAssertEqual(call.timeline.first(where: { $0.id == "interview-consent" })?.state, .complete)
        XCTAssertEqual(call.timeline.first(where: { $0.id == "delivery" })?.state, .current)
        XCTAssertTrue(call.hasSafeSchedule)
        XCTAssertTrue(call.hasSafeRecordingState)
    }

    func testDeclinedInterviewConsentStopsRecordingAndPreviewWork() {
        let date = Date(timeIntervalSince1970: 1_786_400_000)
        let call = StoryCall(
            id: "declined-on-interview",
            sequence: 1,
            status: .interviewConsentDeclined,
            storyStartPurchaseDate: date.addingTimeInterval(-86_400),
            storytellerPermission: StorytellerPermission(
                status: .granted,
                familyPassIssuedAt: date.addingTimeInterval(-86_400),
                familyPassRespondedAt: date.addingTimeInterval(-64_800),
                managedHumanCheckAt: date.addingTimeInterval(-43_200),
                managedHumanContactDirection: .inbound,
                identityVerifiedAt: date.addingTimeInterval(-43_200),
                permissionGrantedAt: date.addingTimeInterval(-43_200)
            ),
            scheduledFor: date,
            interviewConsent: InterviewConsentRecord(status: .declined, respondedAt: date)
        )

        XCTAssertEqual(call.timeline.first(where: { $0.id == "interview-consent" })?.state, .stopped)
        XCTAssertEqual(call.timeline.first(where: { $0.id == "conversation" })?.detail, "Not recorded")
        XCTAssertEqual(call.timeline.first(where: { $0.id == "preview" })?.state, .stopped)
        XCTAssertTrue(call.hasSafeRecordingState)
        XCTAssertNil(call.chapterID)
    }

    func testStoryStartRequiresExplicitHandshakeAcknowledgment() async throws {
        let api = MockStorySittingAPI()
        let request = PurchaseIntentRequest(
            purchase: .storyStart,
            projectID: "project_leo",
            selectedQuestionIDs: ["leo_q_childhood"],
            sponsorAcknowledgedHandshake: false
        )

        do {
            _ = try await api.createPurchaseIntent(request)
            XCTFail("Expected the safe-handshake acknowledgment")
        } catch {
            XCTAssertEqual(error as? StorySittingAPIError, .storyStartAcknowledgmentRequired)
        }
    }

    func testSponsorStoryStartCannotScheduleAIInterview() async throws {
        let fixed = Date(timeIntervalSince1970: 1_800_000_000)
        let api = MockStorySittingAPI(now: { fixed })
        let project = try await fulfillStoryStart(
            api: api,
            projectID: "project_evelyn",
            selectedQuestionIDs: ["q_keep", "q_brave"],
            transactionID: 101
        )
        XCTAssertEqual(project.calls.count, 3)
        XCTAssertEqual(project.latestCall?.sequence, 3)
        XCTAssertEqual(project.latestCall?.status, .awaitingFamilyPassResponse)
        XCTAssertEqual(project.latestCall?.storytellerPermission.status, .awaitingFamilyPassResponse)
        XCTAssertNil(project.latestCall?.storytellerPermission.familyPassRespondedAt)
        XCTAssertNil(project.latestCall?.storytellerPermission.managedHumanCheckAt)
        XCTAssertNil(project.latestCall?.storytellerPermission.permissionGrantedAt)
        XCTAssertNil(project.latestCall?.scheduledFor)
        XCTAssertEqual(project.latestCall?.storytellerPermission.allowsInterviewScheduling, false)
        XCTAssertEqual(project.latestCall?.hasSafeSchedule, true)
        XCTAssertEqual(project.latestCall?.storyStartPurchaseDate, fixed)
        XCTAssertEqual(project.latestCall?.timeline.first(where: { $0.id == "family-pass-response" })?.state, .current)
        XCTAssertEqual(project.latestCall?.timeline.first(where: { $0.id == "managed-human-permission" })?.state, .upcoming)
        XCTAssertEqual(project.latestCall?.timeline.first(where: { $0.id == "scheduled" })?.state, .upcoming)
    }

    func testModelDetectsSponsorOnlyScheduleAsUnsafeState() {
        let date = Date(timeIntervalSince1970: 1_800_000_000)
        let unsafe = StoryCall(
            id: "unsafe",
            sequence: 1,
            status: .scheduled,
            storyStartPurchaseDate: date,
            storytellerPermission: StorytellerPermission(
                status: .awaitingFamilyPassResponse,
                familyPassIssuedAt: date
            ),
            scheduledFor: date.addingTimeInterval(86_400)
        )

        XCTAssertFalse(unsafe.storytellerPermission.allowsInterviewScheduling)
        XCTAssertFalse(unsafe.hasSafeSchedule)
    }

    func testFamilyPassResponseAloneCannotScheduleAIInterview() async throws {
        let fixed = Date(timeIntervalSince1970: 1_800_000_000)
        let api = MockStorySittingAPI(now: { fixed })
        let started = try await fulfillStoryStart(
            api: api,
            projectID: "project_leo",
            selectedQuestionIDs: ["leo_q_childhood"],
            transactionID: 201
        )
        let callID = try XCTUnwrap(started.latestCall?.id)
        let responded = try await api.recordFamilyPassResponse(
            projectID: "project_leo",
            callID: callID,
            wantsManagedHumanCheck: true
        )

        XCTAssertEqual(responded.latestCall?.storytellerPermission.status, .awaitingManagedHumanCheck)
        XCTAssertEqual(responded.latestCall?.storytellerPermission.familyPassRespondedAt, fixed)
        XCTAssertNil(responded.latestCall?.storytellerPermission.managedHumanCheckAt)
        XCTAssertEqual(responded.latestCall?.status, .awaitingManagedHumanPermissionCheck)
        XCTAssertNil(responded.latestCall?.scheduledFor)
        XCTAssertFalse(try XCTUnwrap(responded.latestCall).storytellerPermission.allowsInterviewScheduling)
        XCTAssertEqual(responded.latestCall?.timeline.first(where: { $0.id == "family-pass-response" })?.state, .complete)
        XCTAssertEqual(responded.latestCall?.timeline.first(where: { $0.id == "managed-human-permission" })?.state, .current)
        XCTAssertEqual(responded.latestCall?.timeline.first(where: { $0.id == "scheduled" })?.state, .upcoming)
    }

    func testManagedHumanOutboundPermissionCheckUnlocksScheduling() async throws {
        let fixed = Date(timeIntervalSince1970: 1_800_000_000)
        let api = MockStorySittingAPI(now: { fixed })
        let started = try await fulfillStoryStart(
            api: api,
            projectID: "project_leo",
            selectedQuestionIDs: ["leo_q_childhood"],
            transactionID: 251
        )
        let callID = try XCTUnwrap(started.latestCall?.id)
        _ = try await api.recordFamilyPassResponse(
            projectID: "project_leo",
            callID: callID,
            wantsManagedHumanCheck: true
        )
        let granted = try await api.recordManagedHumanPermissionCheck(
            projectID: "project_leo",
            callID: callID,
            contactDirection: .outbound,
            identityVerified: true,
            permissionGranted: true
        )

        XCTAssertEqual(granted.latestCall?.storytellerPermission.status, .granted)
        XCTAssertEqual(granted.latestCall?.storytellerPermission.managedHumanContactDirection, .outbound)
        XCTAssertEqual(granted.latestCall?.storytellerPermission.identityVerifiedAt, fixed)
        XCTAssertEqual(granted.latestCall?.storytellerPermission.permissionGrantedAt, fixed)
        XCTAssertEqual(granted.latestCall?.status, .scheduled)
        XCTAssertNotNil(granted.latestCall?.scheduledFor)
        XCTAssertEqual(granted.latestCall?.storytellerPermission.allowsInterviewScheduling, true)
        XCTAssertEqual(granted.latestCall?.hasSafeSchedule, true)
        XCTAssertEqual(granted.latestCall?.timeline.first(where: { $0.id == "scheduled" })?.state, .current)
        XCTAssertEqual(granted.latestCall?.timeline.first(where: { $0.id == "interview-consent" })?.state, .upcoming)
    }

    func testDeclinedFamilyPassNeverStartsHumanCheckOrAIInterview() async throws {
        let api = MockStorySittingAPI()
        let started = try await fulfillStoryStart(
            api: api,
            projectID: "project_leo",
            selectedQuestionIDs: [],
            transactionID: 301
        )
        let callID = try XCTUnwrap(started.latestCall?.id)
        let declined = try await api.recordFamilyPassResponse(
            projectID: "project_leo",
            callID: callID,
            wantsManagedHumanCheck: false
        )

        XCTAssertEqual(declined.latestCall?.status, .permissionDeclined)
        XCTAssertEqual(declined.latestCall?.storytellerPermission.status, .declined)
        XCTAssertNil(declined.latestCall?.storytellerPermission.managedHumanCheckAt)
        XCTAssertNil(declined.latestCall?.scheduledFor)
        XCTAssertEqual(declined.latestCall?.timeline.first(where: { $0.id == "managed-human-permission" })?.state, .stopped)
        XCTAssertEqual(declined.latestCall?.timeline.first(where: { $0.id == "scheduled" })?.state, .stopped)
        XCTAssertEqual(declined.latestCall?.timeline.first(where: { $0.id == "interview-consent" })?.state, .stopped)
    }

    func testUnverifiedManagedHumanCheckCannotAssertPermission() async throws {
        let api = MockStorySittingAPI()
        let started = try await fulfillStoryStart(
            api: api,
            projectID: "project_leo",
            selectedQuestionIDs: [],
            transactionID: 302
        )
        let callID = try XCTUnwrap(started.latestCall?.id)
        _ = try await api.recordFamilyPassResponse(
            projectID: "project_leo",
            callID: callID,
            wantsManagedHumanCheck: true
        )

        do {
            _ = try await api.recordManagedHumanPermissionCheck(
                projectID: "project_leo",
                callID: callID,
                contactDirection: .inbound,
                identityVerified: false,
                permissionGranted: true
            )
            XCTFail("Expected an unverified identity check to reject permission")
        } catch let error as StorySittingAPIError {
            guard case .invalidRequest = error else {
                return XCTFail("Unexpected error: \(error)")
            }
        }

        let project = try await api.project(id: "project_leo")
        XCTAssertEqual(project.latestCall?.status, .awaitingManagedHumanPermissionCheck)
        XCTAssertNil(project.latestCall?.storytellerPermission.identityVerifiedAt)
        XCTAssertNil(project.latestCall?.storytellerPermission.permissionGrantedAt)
        XCTAssertNil(project.latestCall?.scheduledFor)
        XCTAssertFalse(try XCTUnwrap(project.latestCall).storytellerPermission.allowsInterviewScheduling)
    }

    func testVerifiedManagedHumanDeclineNeverSchedulesAIInterview() async throws {
        let api = MockStorySittingAPI()
        let started = try await fulfillStoryStart(
            api: api,
            projectID: "project_leo",
            selectedQuestionIDs: [],
            transactionID: 303
        )
        let callID = try XCTUnwrap(started.latestCall?.id)
        _ = try await api.recordFamilyPassResponse(
            projectID: "project_leo",
            callID: callID,
            wantsManagedHumanCheck: true
        )
        let declined = try await api.recordManagedHumanPermissionCheck(
            projectID: "project_leo",
            callID: callID,
            contactDirection: .inbound,
            identityVerified: true,
            permissionGranted: false
        )

        XCTAssertEqual(declined.latestCall?.status, .permissionDeclined)
        XCTAssertEqual(declined.latestCall?.storytellerPermission.status, .declined)
        XCTAssertEqual(declined.latestCall?.storytellerPermission.managedHumanContactDirection, .inbound)
        XCTAssertNotNil(declined.latestCall?.storytellerPermission.identityVerifiedAt)
        XCTAssertNil(declined.latestCall?.storytellerPermission.permissionGrantedAt)
        XCTAssertNil(declined.latestCall?.scheduledFor)
        XCTAssertEqual(declined.latestCall?.timeline.first(where: { $0.id == "scheduled" })?.state, .stopped)
    }

    func testOptionalKeepResultHydratesAndDeliversFinishedChapter() async throws {
        let fixed = Date(timeIntervalSince1970: 1_800_000_000)
        let api = MockStorySittingAPI(now: { fixed })
        let preview = try await api.project(id: "project_evelyn")
        XCTAssertNil(preview.chapters.first(where: { $0.id == "chapter_evelyn_2" })?.fullText)
        let intent = try await api.createPurchaseIntent(
            PurchaseIntentRequest(
                purchase: .storyEdition,
                projectID: "project_evelyn",
                chapterID: "chapter_evelyn_2"
            )
        )
        let project = try await api.fulfillPurchase(proof(for: intent, transactionID: 401))

        XCTAssertEqual(project.chapters.first(where: { $0.id == "chapter_evelyn_2" })?.access, .unlocked)
        XCTAssertNotNil(project.chapters.first(where: { $0.id == "chapter_evelyn_2" })?.fullText)
        XCTAssertEqual(project.calls.first(where: { $0.chapterID == "chapter_evelyn_2" })?.status, .delivered)
        XCTAssertEqual(project.calls.first(where: { $0.chapterID == "chapter_evelyn_2" })?.chapterPurchaseDate, fixed)
    }

    func testResultEditionUpgradeChargesOnlyDifferenceAndKeepsHigherLayer() async throws {
        let api = MockStorySittingAPI()
        let voiceIntent = try await api.createPurchaseIntent(
            PurchaseIntentRequest(purchase: .voiceEdition, projectID: "project_evelyn", chapterID: "chapter_evelyn_2")
        )
        let voice = try await api.fulfillPurchase(proof(for: voiceIntent, transactionID: 451))
        XCTAssertEqual(voice.chapters.first(where: { $0.id == "chapter_evelyn_2" })?.resultEdition, .voice)
        XCTAssertNil(voice.chapters.first(where: { $0.id == "chapter_evelyn_2" })?.fullText)

        let storyIntent = try await api.createPurchaseIntent(
            PurchaseIntentRequest(purchase: .voiceToStory, projectID: "project_evelyn", chapterID: "chapter_evelyn_2")
        )
        XCTAssertEqual(storyIntent.purchase.priceCents, 4_000)
        let story = try await api.fulfillPurchase(proof(for: storyIntent, transactionID: 452))
        XCTAssertEqual(story.chapters.first(where: { $0.id == "chapter_evelyn_2" })?.resultEdition, .story)
        XCTAssertNotNil(story.chapters.first(where: { $0.id == "chapter_evelyn_2" })?.fullText)

        let heirloomIntent = try await api.createPurchaseIntent(
            PurchaseIntentRequest(purchase: .storyToHeirloom, projectID: "project_evelyn", chapterID: "chapter_evelyn_2")
        )
        XCTAssertEqual(heirloomIntent.purchase.priceCents, 7_000)
        let heirloom = try await api.fulfillPurchase(proof(for: heirloomIntent, transactionID: 453))
        XCTAssertEqual(heirloom.chapters.first(where: { $0.id == "chapter_evelyn_2" })?.resultEdition, .heirloom)
    }

    func testQuestionSelectionPersistsThroughMockBoundary() async throws {
        let api = MockStorySittingAPI()
        let project = try await api.updateQuestionSelection(
            projectID: "project_evelyn",
            selectedIDs: ["q_keep", "q_childhood"]
        )

        XCTAssertEqual(Set(project.questions.filter(\.isSelected).map(\.id)), ["q_keep", "q_childhood"])
    }

    func testRepeatConsumablesUseDistinctIntentsAndFulfillIdempotently() async throws {
        let api = MockStorySittingAPI()
        let request = PurchaseIntentRequest(
            purchase: .storyStart,
            projectID: "project_leo",
            sponsorAcknowledgedHandshake: true
        )
        let firstIntent = try await api.createPurchaseIntent(request)
        let secondIntent = try await api.createPurchaseIntent(request)
        XCTAssertNotEqual(firstIntent.appAccountToken, secondIntent.appAccountToken)

        let firstProof = proof(for: firstIntent, transactionID: 501)
        _ = try await api.fulfillPurchase(firstProof)
        let afterTwo = try await api.fulfillPurchase(proof(for: secondIntent, transactionID: 502))
        XCTAssertEqual(afterTwo.calls.count, 2)

        let replay = try await api.fulfillPurchase(firstProof)
        XCTAssertEqual(replay.calls.count, 2, "Replaying one unfinished transaction must not create another sitting")
    }

    func testPurchaseProofEncodesStoreKitIdentifiersAsLosslessDecimalStrings() throws {
        let transactionID = UInt64.max
        let originalTransactionID = UInt64.max - 1
        let payload = VerifiedPurchasePayload(
            transactionID: transactionID,
            originalTransactionID: originalTransactionID,
            productID: StoryPurchase.storyStart.productID,
            appAccountToken: UUID(uuidString: "A2A1DD90-E824-4B5E-AD25-91EE2291D309")!,
            signedTransactionJWS: "signed.mock.jws"
        )

        let encoded = try JSONEncoder().encode(payload)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual(object["transactionID"] as? String, "18446744073709551615")
        XCTAssertEqual(object["originalTransactionID"] as? String, "18446744073709551614")
        XCTAssertNil(object["transactionID"] as? NSNumber)

        let decoded = try JSONDecoder().decode(VerifiedPurchasePayload.self, from: encoded)
        XCTAssertEqual(decoded.transactionID, transactionID)
        XCTAssertEqual(decoded.originalTransactionID, originalTransactionID)
    }

    func testPurchaseProofRejectsNumericTransactionIdentifiersOnTheWire() throws {
        let token = UUID(uuidString: "A2A1DD90-E824-4B5E-AD25-91EE2291D309")!
        let numericJSON = """
        {
          "transactionID": 9007199254740993,
          "originalTransactionID": 9007199254740992,
          "productID": "\(StoryPurchase.storyStart.productID)",
          "appAccountToken": "\(token.uuidString)",
          "signedTransactionJWS": "signed.mock.jws"
        }
        """

        XCTAssertThrowsError(
            try JSONDecoder().decode(VerifiedPurchasePayload.self, from: Data(numericJSON.utf8))
        )
    }

    func testPurchaseProofMustMatchIntentTokenAndProduct() async throws {
        let api = MockStorySittingAPI()
        let intent = try await api.createPurchaseIntent(
            PurchaseIntentRequest(
                purchase: .storyStart,
                projectID: "project_leo",
                sponsorAcknowledgedHandshake: true
            )
        )
        let wrongProduct = VerifiedPurchasePayload(
            transactionID: 601,
            originalTransactionID: 601,
            productID: StoryPurchase.storyEdition.productID,
            appAccountToken: intent.appAccountToken,
            signedTransactionJWS: "signed.mock.jws"
        )

        do {
            _ = try await api.fulfillPurchase(wrongProduct)
            XCTFail("Expected product/intent mismatch to fail")
        } catch let error as StorySittingAPIError {
            guard case .purchaseVerificationFailed = error else {
                return XCTFail("Unexpected error: \(error)")
            }
        }
    }

    func testPurchaseFulfillmentRequiresSignedTransactionJWS() async throws {
        let api = MockStorySittingAPI()
        let intent = try await api.createPurchaseIntent(
            PurchaseIntentRequest(
                purchase: .storyStart,
                projectID: "project_leo",
                sponsorAcknowledgedHandshake: true
            )
        )
        let incomplete = VerifiedPurchasePayload(
            transactionID: 602,
            originalTransactionID: 602,
            productID: StoryPurchase.storyStart.productID,
            appAccountToken: intent.appAccountToken,
            signedTransactionJWS: ""
        )

        do {
            _ = try await api.fulfillPurchase(incomplete)
            XCTFail("Expected missing signed transaction to fail")
        } catch let error as StorySittingAPIError {
            guard case .purchaseVerificationFailed = error else {
                return XCTFail("Unexpected error: \(error)")
            }
        }
    }

    private func fulfillStoryStart(
        api: MockStorySittingAPI,
        projectID: String,
        selectedQuestionIDs: [String],
        transactionID: UInt64
    ) async throws -> StoryProject {
        let intent = try await api.createPurchaseIntent(
            PurchaseIntentRequest(
                purchase: .storyStart,
                projectID: projectID,
                selectedQuestionIDs: selectedQuestionIDs,
                sponsorAcknowledgedHandshake: true
            )
        )
        return try await api.fulfillPurchase(proof(for: intent, transactionID: transactionID))
    }

    private func proof(for intent: PurchaseIntent, transactionID: UInt64) -> VerifiedPurchasePayload {
        VerifiedPurchasePayload(
            transactionID: transactionID,
            originalTransactionID: transactionID,
            productID: intent.purchase.productID,
            appAccountToken: intent.appAccountToken,
            signedTransactionJWS: "signed.mock.jws.\(transactionID)"
        )
    }
}
