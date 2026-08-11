import SwiftUI

/// The Listening Ledger: flat archival paper, carbon ink, bottle green, and one
/// proofreader's red. Decoration stays subordinate to the family record.
enum StoryTheme {
    static let endpaper = Color(hex: 0xE9E5DA)
    static let paper = Color(hex: 0xF2EFE6)
    static let paperBright = Color(hex: 0xFAF8F2)
    static let recorderTeal = Color(hex: 0x1F5754)
    static let recorderDark = Color(hex: 0x163633)
    static let emulsionAmber = Color(hex: 0xA54635)
    static let amberWash = Color(hex: 0xE7D9CC)
    static let ink = Color(hex: 0x242522)
    static let mutedInk = Color(hex: 0x666760)
    static let hairline = Color(hex: 0xBBB7AB)
    static let oxblood = Color(hex: 0x8B3F34)
    static let sage = Color(hex: 0xA9BBB3)

    enum FontBook {
        static func display(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
            .system(size: size, weight: weight, design: .serif)
        }

        static func editorial(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
            .system(size: size, weight: weight, design: .serif)
        }

        static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
            .system(size: size, weight: weight, design: .default)
        }

        static func label(_ size: CGFloat) -> Font {
            .system(size: size, weight: .semibold, design: .default)
        }

        static func folio(_ size: CGFloat) -> Font {
            .system(size: size, weight: .semibold, design: .monospaced)
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

struct EndpaperField: View {
    var body: some View {
        StoryTheme.endpaper.ignoresSafeArea()
    }
}

private struct PaperCardModifier: ViewModifier {
    var padding: CGFloat
    var tone: Color

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(tone)
            .overlay {
                Rectangle()
                    .stroke(StoryTheme.hairline.opacity(0.88), lineWidth: 0.8)
            }
    }
}

extension View {
    func paperCard(padding: CGFloat = 18, tone: Color = StoryTheme.paper) -> some View {
        modifier(PaperCardModifier(padding: padding, tone: tone))
    }
}
