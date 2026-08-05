import SwiftUI

@main
struct ChessPuzzleApp: App {
    var body: some Scene {
        WindowGroup {
            GameWebView()
                .ignoresSafeArea(edges: .bottom)
                .background(Color.black)
                .preferredColorScheme(.dark)
        }
    }
}
