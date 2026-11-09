import UIKit
import WebKit
import LocalAuthentication
import Capacitor

/// Bloqueo de la app con Face ID (o Touch ID, o el código del iPhone si la cara no se reconoce).
///
/// No guarda contraseñas ni toca la sesión del CRM: solo tapa la app con la pantalla del sello hasta que el dueño
/// del teléfono se identifica. Se pide al abrir la app y al volver después de un rato fuera, y solo si hay una
/// sesión iniciada (en la pantalla de ingreso no hay nada que proteger). Aparte de eso, la app se tapa siempre que
/// deja de estar en primer plano, para que el selector de apps del iPhone no muestre datos de clientes.
final class Bloqueo {
    static let shared = Bloqueo()

    /// Tiempo fuera de la app durante el cual se puede volver sin identificarse otra vez.
    private var gracia: TimeInterval = 5 * 60

    private weak var principal: UIWindow?
    private var ventana: UIWindow?
    private let pantalla = PantallaBloqueo()
    private var salida: Date?
    /// Hace falta identificarse antes de mostrar la app.
    private var bloqueada = false
    /// Hay que pedir la identificación en cuanto la app quede activa.
    private var pendiente = false
    private var autenticando = false
    private var destapando = false

    private init() {
        #if DEBUG
        // Solo para pruebas: `-bloqueoGracia 5` al lanzar la app acorta la espera a 5 segundos.
        if UserDefaults.standard.object(forKey: "bloqueoGracia") != nil {
            gracia = UserDefaults.standard.double(forKey: "bloqueoGracia")
        }
        #endif
        pantalla.alTocar = { [weak self] in self?.identificar() }
    }

    /// Al abrir la app: se tapa de una vez (la pantalla es igual a la de arranque, así que no se nota el cambio).
    func alAbrir(en escena: UIWindowScene, sobre principal: UIWindow?) {
        self.principal = principal
        let ventana = UIWindow(windowScene: escena)
        ventana.windowLevel = .alert + 1
        ventana.rootViewController = pantalla
        self.ventana = ventana
        bloqueada = true
        tapar()
    }

    /// Al dejar de estar activa (selector de apps, centro de control, una alerta del sistema): se tapa mientras tanto.
    /// Si ya está bloqueada no se toca, porque el propio aviso de Face ID también la deja inactiva.
    func alDesactivar() {
        guard !bloqueada else { return }
        tapar()
    }

    func alSalir() {
        salida = Date()
        principal?.endEditing(true)
        tapar()
    }

    func alVolver() {
        let fuera = salida.map { Date().timeIntervalSince($0) } ?? .infinity
        salida = nil
        if bloqueada || fuera >= gracia {
            bloqueada = true
            pendiente = true
        }
    }

    /// Face ID solo se puede pedir con la app activa; por eso no se pide en `alVolver`.
    func alActivar() {
        guard pendiente else {
            if !bloqueada { destapar() }
            return
        }
        pendiente = false
        haySesion { [weak self] hay in
            guard let self = self else { return }
            if hay { self.identificar() } else { self.destapar() }
        }
    }

    // MARK: -

    private func tapar() {
        guard let ventana = ventana else { return }
        pantalla.ofrecerBoton(nil)
        destapando = false
        ventana.layer.removeAllAnimations()
        ventana.alpha = 1
        ventana.isHidden = false
    }

    private func destapar() {
        bloqueada = false
        guard let ventana = ventana, !ventana.isHidden, !destapando else { return }
        destapando = true
        UIView.animate(withDuration: 0.25, animations: { ventana.alpha = 0 }, completion: { _ in
            // Si la app volvió a taparse durante la animación, se queda tapada.
            guard self.destapando else { return }
            self.destapando = false
            ventana.isHidden = true
        })
    }

    private func identificar() {
        guard bloqueada, !autenticando else { return }
        let contexto = LAContext()
        var error: NSError?
        // Un iPhone sin código no tiene con qué proteger la app: se deja pasar.
        guard contexto.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            destapar()
            return
        }
        let titulo: String
        switch contexto.biometryType {
        case .faceID: titulo = "Desbloquear con Face ID"
        case .touchID: titulo = "Desbloquear con Touch ID"
        default: titulo = "Desbloquear"
        }
        autenticando = true
        pantalla.ofrecerBoton(nil)
        contexto.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Desbloquea Firplak CRM") { [weak self] ok, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.autenticando = false
                if ok { self.destapar() } else { self.pantalla.ofrecerBoton(titulo) }
            }
        }
    }

    /// Hay sesión si la vista web guarda la cookie de sesión de Supabase del CRM (`sb-…-auth-token`, a veces en partes).
    /// Si la respuesta no llega, se asume que sí: es preferible pedir Face ID de más que mostrar la app sin pedirlo.
    private func haySesion(_ listo: @escaping (Bool) -> Void) {
        guard let crm = principal?.rootViewController as? CAPBridgeViewController,
              let web = crm.webView,
              let host = crm.bridge?.config.serverURL.host else {
            listo(true)
            return
        }
        var respondido = false
        let responder: (Bool) -> Void = { hay in
            guard !respondido else { return }
            respondido = true
            listo(hay)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { responder(true) }
        web.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
            let ahora = Date()
            let hay = cookies.contains { cookie in
                let dominio = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
                return (host == dominio || host.hasSuffix("." + dominio))
                    && cookie.name.range(of: "^sb-.+-auth-token(\\.[0-9]+)?$", options: .regularExpression) != nil
                    && (cookie.expiresDate.map { $0 > ahora } ?? true)
            }
            DispatchQueue.main.async { responder(hay) }
        }
    }
}

/// Lo que se ve mientras la app está tapada: la pantalla de arranque (navy con el sello) y, si la identificación
/// falló o se canceló, un botón para intentarlo otra vez.
private final class PantallaBloqueo: UIViewController {
    var alTocar: (() -> Void)?
    private let boton = UIButton(type: .system)

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        let navy = UIColor(red: 0.1451, green: 0.2549, blue: 0.3255, alpha: 1)
        view.backgroundColor = navy

        let sello = UIImageView(image: UIImage(named: "Splash"))
        sello.contentMode = .scaleAspectFill
        sello.clipsToBounds = true
        sello.frame = view.bounds
        sello.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(sello)

        var estilo = UIButton.Configuration.filled()
        estilo.baseBackgroundColor = .white
        estilo.baseForegroundColor = navy
        estilo.cornerStyle = .capsule
        estilo.imagePadding = 10
        estilo.contentInsets = NSDirectionalEdgeInsets(top: 16, leading: 24, bottom: 16, trailing: 24)
        boton.configuration = estilo
        boton.isHidden = true
        boton.translatesAutoresizingMaskIntoConstraints = false
        boton.addAction(UIAction { [weak self] _ in self?.alTocar?() }, for: .touchUpInside)
        view.addSubview(boton)
        NSLayoutConstraint.activate([
            boton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            boton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -32),
            boton.leadingAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            boton.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
        ])
    }

    /// Muestra el botón con ese texto, o lo esconde si el texto es `nil`.
    func ofrecerBoton(_ titulo: String?) {
        loadViewIfNeeded()
        guard let titulo = titulo else {
            boton.isHidden = true
            return
        }
        var estilo = boton.configuration
        var texto = AttributedString(titulo)
        texto.font = UIFont.preferredFont(forTextStyle: .headline)
        estilo?.attributedTitle = texto
        estilo?.image = UIImage(systemName: titulo.contains("Face ID") ? "faceid" : titulo.contains("Touch ID") ? "touchid" : "lock.open")
        boton.configuration = estilo
        boton.isHidden = false
    }
}
