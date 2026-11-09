import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CrmViewController()
        window?.makeKeyAndVisible()
        Bloqueo.shared.alAbrir(en: windowScene, sobre: window)

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    // Bloqueo con Face ID: la app se tapa al dejar de estar en primer plano y pide identificarse al volver
    // (ver Bloqueo.swift).
    func sceneWillResignActive(_ scene: UIScene) {
        Bloqueo.shared.alDesactivar()
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        Bloqueo.shared.alSalir()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        Bloqueo.shared.alVolver()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        Bloqueo.shared.alActivar()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
