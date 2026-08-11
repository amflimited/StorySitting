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
                    LazyVStack(alignment: .leading, spacing: 20) {
                        header(project)
                        storyPicker

                        HStack(spacing: 13) {
                            Image(systemName: "text.bubble.fill")
                                .font(.system(size: 19, weight: .semibold))
                                .foregroundStyle(StoryTheme.recorderDark)
                                .frame(width: 46, height: 46)
                                .background(StoryTheme.butter.opacity(0.55), in: Circle())
                            VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text("\(selectedIDs.count) selected")
                                    .font(StoryTheme.FontBook.label(14))
                                    .foregroundStyle(StoryTheme.recorderTeal)
                            }
                            Text("For the next sitting · a guide, never a script")
                                .font(StoryTheme.FontBook.body(12))
                                .foregroundStyle(StoryTheme.mutedInk)
                            }
                        }
                        .paperCard(padding: 15, tone: StoryTheme.paperBright.opacity(0.9))

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
        VStack(alignment: .leading, spacing: 7) {
            Text("What have you always wondered?")
                .font(StoryTheme.FontBook.display(32, weight: .bold))
                .tracking(-0.9)
                .foregroundStyle(StoryTheme.ink)
            Text("Save the questions that could only come from your family.")
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
                        Text("Question deck for")
                            .font(StoryTheme.FontBook.body(11, weight: .medium))
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
            .background(StoryTheme.paperBright.opacity(0.85), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(StoryTheme.hairline, lineWidth: 0.7)
            }
        }
    }

    private func questionSection(_ category: FamilyQuestion.Category, questions: [FamilyQuestion]) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            Text(category.title)
                .font(StoryTheme.FontBook.display(22, weight: .bold))
                .foregroundStyle(StoryTheme.ink)
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
                            Circle()
                                .fill(questionColor(question).opacity(0.12))
                            Image(systemName: questionSymbol(question))
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(questionColor(question))
                        }
                        .frame(width: 34, height: 34)
                        Text(question.prompt)
                            .font(StoryTheme.FontBook.body(16, weight: .semibold))
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
                    .font(StoryTheme.FontBook.body(17, weight: .medium))
                    .lineLimit(3...6)
                    .padding(14)
                    .background(StoryTheme.paperBright, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(StoryTheme.hairline, lineWidth: 0.8)
                    }
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
