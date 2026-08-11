import Foundation
import SwiftUI
import StorySittingCore

struct QuestionsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var selectedIDs: Set<String> = []
    @State private var showingAddQuestion = false

    var body: some View {
        ZStack {
            EndpaperField()
            if let project = model.selectedProject {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 24) {
                        header(project)
                        storyPicker

                        VStack(alignment: .leading, spacing: 11) {
                            HStack {
                                Eyebrow(text: "Packed for next sitting")
                                Spacer()
                                Text("\(selectedIDs.count) selected")
                                    .font(StoryTheme.FontBook.folio(10))
                                    .foregroundStyle(StoryTheme.recorderTeal)
                            }
                            Text("Give the conversation a place to begin. The interviewer follows their story, not a script.")
                                .font(StoryTheme.FontBook.body(13))
                                .foregroundStyle(StoryTheme.mutedInk)
                        }
                        .paperCard(tone: StoryTheme.paperBright.opacity(0.82))

                        ForEach(FamilyQuestion.Category.allCases, id: \.self) { category in
                            let questions = project.questions.filter { $0.category == category }
                            if !questions.isEmpty {
                                questionSection(category, questions: questions)
                            }
                        }

                        Button { showingAddQuestion = true } label: {
                            HStack {
                                Image(systemName: "plus.circle.fill")
                                Text("Add a question only your family would ask")
                                Spacer()
                            }
                            .font(StoryTheme.FontBook.label(13))
                            .foregroundStyle(StoryTheme.recorderTeal)
                            .paperCard(tone: StoryTheme.paperBright.opacity(0.75))
                        }
                        .buttonStyle(.plain)

                        Button {
                            Task { await model.setSelectedQuestions(projectID: project.id, ids: selectedIDs) }
                        } label: {
                            FilledActionLabel(
                                title: "Save for the next sitting",
                                detail: selectedIDs.isEmpty ? "StorySitting will use gentle starter prompts" : "\(selectedIDs.count) family questions ready",
                                symbol: "checkmark"
                            )
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 16)
                    .padding(.bottom, 32)
                }
                .task(id: project.id) {
                    selectedIDs = Set(project.questions.filter(\.isSelected).map(\.id))
                }
                .sheet(isPresented: $showingAddQuestion, onDismiss: {
                    guard let refreshed = model.project(id: project.id) else { return }
                    selectedIDs = Set(refreshed.questions.filter(\.isSelected).map(\.id))
                }) {
                    AddQuestionSheet(projectID: project.id)
                        .presentationDetents([.medium])
                        .presentationDragIndicator(.visible)
                }
            }
        }
        .navigationTitle("Family Questions")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(StoryTheme.endpaper.opacity(0.94), for: .navigationBar)
    }

    private func header(_ project: StoryProject) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Eyebrow(text: "Ask while you can")
            Text("What have you\nalways wondered?")
                .font(StoryTheme.FontBook.display(39, weight: .medium))
                .tracking(-1.1)
                .foregroundStyle(StoryTheme.ink)
                .lineSpacing(-3)
            Text("Shape \(project.storyteller.familiarName)’s next conversation together.")
                .font(StoryTheme.FontBook.body(14))
                .foregroundStyle(StoryTheme.mutedInk)
        }
    }

    private var storyPicker: some View {
        Menu {
            ForEach(model.projects) { project in
                Button {
                    model.selectedProjectID = project.id
                } label: {
                    Label(project.storyteller.familiarName, systemImage: project.id == model.selectedProjectID ? "checkmark" : "person")
                }
            }
        } label: {
            HStack(spacing: 10) {
                if let project = model.selectedProject {
                    FamilyPortrait(name: project.storyteller.name, size: 38, seed: project.accentSeed)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("QUESTION DECK FOR")
                            .font(StoryTheme.FontBook.folio(8))
                            .foregroundStyle(StoryTheme.mutedInk)
                        Text(project.storyteller.familiarName)
                            .font(StoryTheme.FontBook.label(13))
                            .foregroundStyle(StoryTheme.ink)
                    }
                }
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(StoryTheme.recorderTeal)
            }
            .padding(11)
            .background(StoryTheme.paperBright.opacity(0.72))
            .overlay(Rectangle().stroke(StoryTheme.hairline, lineWidth: 0.7))
        }
    }

    private func questionSection(_ category: FamilyQuestion.Category, questions: [FamilyQuestion]) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            SectionHeading(eyebrow: "Question cards", title: category.title)
            ForEach(questions) { question in
                Button {
                    guard question.answeredInChapterID == nil else { return }
                    if selectedIDs.contains(question.id) {
                        selectedIDs.remove(question.id)
                    } else {
                        selectedIDs.insert(question.id)
                    }
                } label: {
                    HStack(alignment: .top, spacing: 13) {
                        ZStack {
                            Rectangle()
                                .fill(questionColor(question).opacity(0.12))
                            Image(systemName: questionSymbol(question))
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(questionColor(question))
                        }
                        .frame(width: 34, height: 34)
                        Text(question.prompt)
                            .font(StoryTheme.FontBook.editorial(17, weight: .medium))
                            .foregroundStyle(StoryTheme.ink)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 4)
                    }
                    .paperCard(padding: 14, tone: selectedIDs.contains(question.id) ? StoryTheme.sage.opacity(0.2) : StoryTheme.paperBright.opacity(0.82))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(question.prompt + (selectedIDs.contains(question.id) ? ", selected" : ""))
            }
        }
    }

    private func questionColor(_ question: FamilyQuestion) -> Color {
        if question.answeredInChapterID != nil { return StoryTheme.mutedInk }
        return selectedIDs.contains(question.id) ? StoryTheme.recorderTeal : StoryTheme.emulsionAmber
    }

    private func questionSymbol(_ question: FamilyQuestion) -> String {
        if question.answeredInChapterID != nil { return "checkmark" }
        return selectedIDs.contains(question.id) ? "bookmark.fill" : "plus"
    }
}

private struct AddQuestionSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @State private var prompt = ""
    @State private var category: FamilyQuestion.Category = .people
    let projectID: String

    var body: some View {
        ZStack {
            EndpaperField()
            VStack(alignment: .leading, spacing: 18) {
                Eyebrow(text: "From your family")
                Text("Add the question you don’t want to lose.")
                    .font(StoryTheme.FontBook.display(29))
                    .foregroundStyle(StoryTheme.ink)
                TextField("What did you always want to ask?", text: $prompt, axis: .vertical)
                    .font(StoryTheme.FontBook.editorial(17))
                    .lineLimit(3...6)
                    .padding(14)
                    .background(StoryTheme.paperBright)
                    .overlay(Rectangle().stroke(StoryTheme.hairline, lineWidth: 0.8))
                Picker("Theme", selection: $category) {
                    ForEach(FamilyQuestion.Category.allCases, id: \.self) { value in
                        Text(value.title).tag(value)
                    }
                }
                .pickerStyle(.menu)
                Spacer()
                Button {
                    Task {
                        if await model.addQuestion(projectID: projectID, prompt: prompt, category: category) {
                            dismiss()
                        }
                    }
                } label: {
                    FilledActionLabel(title: "Add to the family deck", symbol: "plus")
                }
                .buttonStyle(.plain)
                .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).count < 5)
                .opacity(prompt.trimmingCharacters(in: .whitespacesAndNewlines).count < 5 ? 0.5 : 1)
            }
            .padding(20)
        }
    }
}
