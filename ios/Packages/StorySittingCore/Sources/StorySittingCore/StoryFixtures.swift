import Foundation

public enum StoryFixtures {
    public static func shelf(referenceDate: Date) -> [StoryProject] {
        [evelyn(referenceDate: referenceDate), leo(referenceDate: referenceDate)]
    }

    public static func evelyn(referenceDate: Date) -> StoryProject {
        let firstRecorded = referenceDate.addingTimeInterval(-24 * 86_400)
        let secondRecorded = referenceDate.addingTimeInterval(-3 * 86_400)

        let chapterOne = StoryChapter(
            id: "chapter_evelyn_1",
            number: 1,
            title: "The house smelled like Sunday dinner",
            dek: "Tomatoes on the stove, cousins underfoot, and a table that always made room.",
            previewText: "Before anyone reached the table, the house already felt like family. Evelyn remembers the screen door tapping shut and her mother calling from the kitchen.",
            fullText: "Before anyone reached the table, the house already felt like family. Evelyn remembers the screen door tapping shut and her mother calling from the kitchen. The sauce had been going since breakfast, but nobody used a timer. Her mother watched the shine on the wooden spoon and knew.\n\nBy four o’clock, folding chairs appeared from the hall closet. Children were sent outside with bread to keep their hands busy. There was never a seating chart and, somehow, always one more place.\n\nEvelyn says the meal was not really the tradition. The tradition was making room before anyone had to ask. She carried that forward: an extra plate, a pot that could stretch, and a door that did not stay closed for long.",
            pullQuote: "The recipe was making room before anyone had to ask.",
            recordedAt: firstRecorded,
            access: .unlocked,
            audio: AudioKeepsake(durationSeconds: 522, previewSeconds: 45)
        )

        let chapterTwo = StoryChapter(
            id: "chapter_evelyn_2",
            number: 2,
            title: "The recipe lived in her hands",
            dek: "Why the card was never enough—and the little tests Evelyn still uses today.",
            previewText: "The card says ‘flour as needed,’ which Evelyn admits is not much help. What it means is: until the dough stops asking for more.",
            fullText: nil,
            pullQuote: "You add flour until the dough stops asking for more.",
            recordedAt: secondRecorded,
            access: .preview,
            audio: AudioKeepsake(durationSeconds: 438, previewSeconds: 45)
        )

        let firstCall = StoryCall(
            id: "call_evelyn_1",
            sequence: 1,
            status: .delivered,
            storyStartPurchaseDate: firstRecorded.addingTimeInterval(-3 * 86_400),
            storytellerPermission: StorytellerPermission(
                status: .granted,
                familyPassIssuedAt: firstRecorded.addingTimeInterval(-3 * 86_400),
                familyPassRespondedAt: firstRecorded.addingTimeInterval(-216_000),
                managedHumanCheckAt: firstRecorded.addingTimeInterval(-2 * 86_400),
                managedHumanContactDirection: .inbound,
                identityVerifiedAt: firstRecorded.addingTimeInterval(-2 * 86_400),
                permissionGrantedAt: firstRecorded.addingTimeInterval(-2 * 86_400)
            ),
            scheduledFor: firstRecorded,
            interviewConsent: InterviewConsentRecord(status: .granted, respondedAt: firstRecorded),
            interviewStartedAt: firstRecorded,
            interviewEndedAt: firstRecorded.addingTimeInterval(1_384),
            selectedQuestionIDs: ["q_kitchen", "q_table"],
            chapterID: chapterOne.id,
            chapterPurchaseDate: firstRecorded.addingTimeInterval(2 * 86_400)
        )

        let secondCall = StoryCall(
            id: "call_evelyn_2",
            sequence: 2,
            status: .previewReady,
            storyStartPurchaseDate: secondRecorded.addingTimeInterval(-3 * 86_400),
            storytellerPermission: StorytellerPermission(
                status: .granted,
                familyPassIssuedAt: secondRecorded.addingTimeInterval(-3 * 86_400),
                familyPassRespondedAt: secondRecorded.addingTimeInterval(-216_000),
                managedHumanCheckAt: secondRecorded.addingTimeInterval(-2 * 86_400),
                managedHumanContactDirection: .outbound,
                identityVerifiedAt: secondRecorded.addingTimeInterval(-2 * 86_400),
                permissionGrantedAt: secondRecorded.addingTimeInterval(-2 * 86_400)
            ),
            scheduledFor: secondRecorded,
            interviewConsent: InterviewConsentRecord(status: .granted, respondedAt: secondRecorded),
            interviewStartedAt: secondRecorded,
            interviewEndedAt: secondRecorded.addingTimeInterval(1_317),
            selectedQuestionIDs: ["q_recipe", "q_learned"],
            chapterID: chapterTwo.id
        )

        return StoryProject(
            id: "project_evelyn",
            title: "Evelyn’s Kitchen Table",
            organizerName: "Maya",
            storyteller: Storyteller(
                id: "person_evelyn",
                name: "Evelyn Rose Bennett",
                familiarName: "Grandma Evelyn",
                relationship: .grandmother,
                phoneLastFour: "1948",
                birthYear: 1938
            ),
            chapters: [chapterOne, chapterTwo],
            calls: [firstCall, secondCall],
            questions: defaultQuestions,
            accentSeed: 0
        )
    }

    public static func leo(referenceDate: Date) -> StoryProject {
        StoryProject(
            id: "project_leo",
            title: "Leo’s Working Years",
            organizerName: "Maya",
            storyteller: Storyteller(
                id: "person_leo",
                name: "Leonard James Bennett",
                familiarName: "Grandpa Leo",
                relationship: .grandfather,
                phoneLastFour: "0731",
                birthYear: 1935
            ),
            questions: defaultQuestions.map {
                FamilyQuestion(id: "leo_\($0.id)", prompt: $0.prompt, category: $0.category)
            },
            accentSeed: 1
        )
    }

    public static let defaultQuestions: [FamilyQuestion] = [
        FamilyQuestion(id: "q_kitchen", prompt: "What could you hear and smell in the kitchen when everyone arrived?", category: .home, answeredInChapterID: "chapter_evelyn_1"),
        FamilyQuestion(id: "q_table", prompt: "Who always sat where, and what did they bring to the table?", category: .people, answeredInChapterID: "chapter_evelyn_1"),
        FamilyQuestion(id: "q_recipe", prompt: "What part of the recipe never made it onto the card?", category: .traditions, answeredInChapterID: "chapter_evelyn_2"),
        FamilyQuestion(id: "q_learned", prompt: "Who taught you, and how did you know you had finally learned it?", category: .people, answeredInChapterID: "chapter_evelyn_2"),
        FamilyQuestion(id: "q_first_home", prompt: "What did your first home feel like when you opened the door?", category: .home),
        FamilyQuestion(id: "q_brave", prompt: "When did you have to be braver than people realized?", category: .turningPoints, isSelected: true),
        FamilyQuestion(id: "q_childhood", prompt: "What did a perfect childhood afternoon look like?", category: .beginnings),
        FamilyQuestion(id: "q_keep", prompt: "What do you hope our family keeps doing long after us?", category: .wisdom, isSelected: true)
    ]

    /// Simulates content held behind the server-side fulfillment boundary. The
    /// locked chapter model itself contains only its preview.
    static func completedText(for chapterID: String) -> String? {
        guard chapterID == "chapter_evelyn_2" else { return nil }
        return "The card says ‘flour as needed,’ which Evelyn admits is not much help. What it means is: until the dough stops asking for more. She learned the answer by standing beside her mother, watching the heel of a hand turn and press.\n\nThere were other tests the card left out. A loaf ready for the oven sounded hollow underneath. A sauce needed another hour when the sharp tomato smell still reached the hallway. And dough behaved differently on a wet August afternoon.\n\nFor years, Evelyn worried she had failed to write the recipe down properly. During the sitting she realized she had preserved it another way: in the phrases her children repeat, in the way Maya checks the dough, and in the permission to trust your own hands."
    }
}
