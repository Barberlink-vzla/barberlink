// js/auth.js
const SUPABASE_URL = 'https://ktoboiohgwsdjdggjdyo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0b2JvaW9oZ3dzZGpkZ2dqZHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgyMjM1OTAsImV4cCI6MjA2Mzc5OTU5MH0.Rs1F3p9h9BacH1Vd2MyoqErzVKI_do2zYHy2bAIDUvw';

let supabaseClient;

// Función para inicializar Supabase de forma segura
const initSupabaseInAuth = () => {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Cliente Supabase inicializado correctamente en auth.js ✅");

        updateAuthUI();
        supabaseClient.auth.onAuthStateChange((event, session) => {
            console.log('Cambio en estado de autenticación:', event, session);
            updateAuthUI();
        });
    } else {
        console.warn("Librería Supabase (CDN) aún no cargada para auth.js. Reintentando en 200ms... ⏳");
        setTimeout(initSupabaseInAuth, 200);
    }
};

// Elementos del DOM
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const authStatus = document.getElementById('auth-status'); // Puede usarse para mensajes menos intrusivos

// Elementos de la UI de tarjeta flip
const flipCardContainer = document.getElementById('flipCard');
const authFormsStatusContainer = document.getElementById('auth-forms-status-container');

// Elementos del Overlay de Notificación
const notificationOverlay = document.getElementById('notification-overlay');
const notificationBox = document.querySelector('.notification-overlay .notification-box');
const notificationTitle = document.getElementById('notification-title');
const notificationMessage = document.getElementById('notification-message');
const notificationCloseBtn = document.getElementById('notification-close-btn');

/**
 * Muestra una notificación en pantalla.
 * @param {string} title - El título de la notificación.
 * @param {string} message - El mensaje de la notificación (puede contener HTML básico como <br>, <strong>).
 * @param {'success'|'error'|'info'} type - El tipo de notificación.
 */
function showNotification(title, message, type = 'info') {
    if (notificationOverlay && notificationTitle && notificationMessage && notificationCloseBtn && notificationBox) {
        notificationTitle.textContent = title;
        notificationMessage.innerHTML = message; // Usar innerHTML para permitir etiquetas básicas

        // Resetear clases de tipo
        notificationBox.classList.remove('success', 'error', 'info');

        // Aplicar clase de tipo
        if (type === 'success') {
            notificationBox.classList.add('success');
        } else if (type === 'error') {
            notificationBox.classList.add('error');
        } else {
            notificationBox.classList.add('info'); // Para un estilo 'info' si se define
        }

        notificationOverlay.classList.add('show');
    } else {
        console.warn("Elementos de notificación no encontrados. Mostrando alerta fallback.");
        // Fallback si los elementos del overlay no están disponibles
        const alertMessage = `${title}\n\n${message.replace(/<br\s*\/?>/gi, '\n').replace(/<strong>(.*?)<\/strong>/gi, '$1')}`;
        alert(alertMessage);
        // También se podría usar authStatus aquí si se prefiere
        // if (authStatus) {
        //    authStatus.textContent = `${title}: ${message.replace(/<br\s*\/?>/gi, ' ').replace(/<strong>(.*?)<\/strong>/gi, '$1')}`;
        // }
    }
}

// Event Listener para cerrar el overlay de notificación
if (notificationCloseBtn) {
    notificationCloseBtn.addEventListener('click', () => {
        if (notificationOverlay) {
            notificationOverlay.classList.remove('show');
        }
    });
}

// Función para actualizar la UI (sin cambios funcionales mayores, solo asegurar que el overlay no interfiere)
async function updateAuthUI() {
    if (!supabaseClient || !supabaseClient.auth) {
        console.error('Cliente Supabase o módulo auth no está listo para updateAuthUI.');
        if (authStatus) authStatus.textContent = 'Supabase no está listo. Intentando...';
        return;
    }

    const { data: { user } } = await supabaseClient.auth.getUser();

    if (user) {
        if (authStatus) authStatus.textContent = `Sesión iniciada como: ${user.email}`;
        if (logoutButton) logoutButton.style.display = 'block';
        if (flipCardContainer) flipCardContainer.style.display = 'none';
        if (authFormsStatusContainer) authFormsStatusContainer.style.display = 'block';

        if (window.location.pathname.endsWith('login_register.html')) {
            window.location.href = 'barber_profile.html';
        }
    } else {
        if (authStatus) authStatus.textContent = '';
        if (logoutButton) logoutButton.style.display = 'none';
        if (flipCardContainer) flipCardContainer.style.display = 'block'; // O 'relative'
        if (authFormsStatusContainer) authFormsStatusContainer.style.display = 'none';
    }
}

// Event Listener para el registro
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // const name = document.getElementById('register-name').value; // Si añades campo de nombre
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        if (!supabaseClient) {
            showNotification('Error del Sistema', 'El servicio de autenticación no está listo. Intenta de nuevo más tarde.', 'error');
            return;
        }
        if (authStatus) authStatus.textContent = 'Registrando...'; // Mensaje sutil mientras procesa

        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            // options: { // Opcional: para pasar datos adicionales como el nombre
            //   data: { full_name: name }
            // }
        });

        if (authStatus) authStatus.textContent = ''; // Limpiar mensaje sutil

        if (error) {
            showNotification(
                'Error de Registro',
                `No pudimos completar tu registro en este momento.<br>Detalle: ${error.message}`,
                'error'
            );
            console.error('Error de registro:', error.message);
        } else if (data.user) {
            // data.user existe, procedemos a verificar el estado
            if (data.user.identities && data.user.identities.length === 0 && !data.session) {
                // Caso donde el usuario ya existe pero no está confirmado (política de Supabase puede variar)
                showNotification(
                    'Verificación Pendiente',
                    `Ya existe una cuenta con <strong>${email}</strong> pendiente de confirmación.<br>Por favor, revisa tu correo (incluyendo spam) para el enlace de activación, o intenta iniciar sesión si ya confirmaste.`,
                    'info'
                );
                console.log('Usuario posiblemente ya existe y no confirmado:', data.user);
            } else if (data.session === null && data.user.email_verified === false && data.user.confirmation_sent_at) {
                // El caso más común: registro exitoso, se envió email de confirmación
                showNotification(
                    '¡Revisa tu Correo!',
                    `Hemos enviado un correo de confirmación a <strong>${email}</strong>.<br>Por favor, revisa tu bandeja de entrada y la carpeta de spam para activar tu cuenta.`,
                    'success'
                );
                console.log('Usuario registrado, esperando confirmación por email:', data.user);
            } else if (data.session) {
                // Registro exitoso y el usuario ya tiene una sesión (confirmación de email podría estar desactivada)
                // updateAuthUI se encargará de la redirección. La notificación será breve.
                showNotification(
                    '¡Registro Exitoso!',
                    `Tu cuenta ha sido creada y has iniciado sesión. Serás redirigido en breve.`,
                    'success'
                );
                console.log('Usuario registrado y sesión iniciada (confirmación de email desactivada o auto-confirmado):', data.user);
            } else {
                // Un estado inesperado, pero el usuario fue creado
                showNotification(
                    'Registro Completado',
                    `Tu cuenta para <strong>${email}</strong> ha sido creada. Puede que necesites confirmar tu correo electrónico o iniciar sesión.`,
                    'info'
                );
                console.log('Usuario registrado con estado de sesión/confirmación no estándar:', data);
            }
            if (registerForm) registerForm.reset(); // Limpiar el formulario
        } else {
            // Ni error, ni data.user - caso muy raro
            showNotification(
                'Error Inesperado',
                'Ocurrió un problema durante el registro. Por favor, intenta de nuevo.',
                'error'
            );
            console.error('Respuesta inesperada del signUp:', data);
        }
    });
} else {
    console.warn("Elemento register-form no encontrado.");
}

// Event Listener para el inicio de sesión
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        if (!supabaseClient) {
            showNotification('Error del Sistema', 'El servicio de autenticación no está listo. Intenta de nuevo más tarde.', 'error');
            return;
        }
        if (authStatus) authStatus.textContent = 'Iniciando sesión...';

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (authStatus) authStatus.textContent = '';

        if (error) {
            let friendlyMessage = `No pudimos iniciar tu sesión.<br>Detalle: ${error.message}`;
            if (error.message.toLowerCase().includes('invalid login credentials')) {
                friendlyMessage = 'El correo electrónico o la contraseña son incorrectos. Por favor, verifica tus datos e intenta de nuevo.';
            } else if (error.message.toLowerCase().includes('email not confirmed')) {
                friendlyMessage = `Tu correo electrónico aún no ha sido confirmado.<br>Por favor, busca el correo de confirmación en tu bandeja de entrada (y spam) y haz clic en el enlace para activar tu cuenta. <button id="resend-confirmation-btn" data-email="${email}" class="link-button">Reenviar correo</button>`;
            }
            showNotification('Error de Inicio de Sesión', friendlyMessage, 'error');
            console.error('Error de login:', error.message);

            // Añadir listener para el botón de reenviar confirmación si existe
            const resendBtn = document.getElementById('resend-confirmation-btn');
            if (resendBtn) {
                resendBtn.addEventListener('click', async (event) => {
                    const emailToResend = event.target.dataset.email;
                    if (authStatus) authStatus.textContent = `Reenviando correo a ${emailToResend}...`;
                    
                    const { data: resendData, error: resendError } = await supabaseClient.auth.resend({
                        type: 'signup', // o 'recovery', etc. dependiendo del contexto. 'signup' para la confirmación inicial.
                        email: emailToResend
                    });

                    if (authStatus) authStatus.textContent = '';
                    
                    if (resendError) {
                        showNotification('Error al Reenviar', `No se pudo reenviar el correo de confirmación.<br>Detalle: ${resendError.message}`, 'error');
                    } else {
                        showNotification('Correo Reenviado', `Se ha enviado un nuevo correo de confirmación a <strong>${emailToResend}</strong>.<br>Por favor, revisa tu bandeja de entrada y spam.`, 'success');
                    }
                });
            }

        } else {
            // Inicio de sesión exitoso, updateAuthUI se encargará de la redirección y UI.
            console.log('Usuario logueado:', data.user);
            if (loginForm) loginForm.reset();
            // No es necesario un showNotification aquí porque la página redirigirá.
        }
    });
} else {
    console.warn("Elemento login-form no encontrado.");
}

// Event Listener para cerrar sesión
if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        if (!supabaseClient) {
            showNotification('Error del Sistema', 'El servicio de autenticación no está listo.', 'error');
            return;
        }
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            showNotification('Error', `Error al cerrar sesión: ${error.message}`, 'error');
            console.error('Error de logout:', error.message);
        } else {
            console.log('Sesión cerrada');
            // updateAuthUI() se llama automáticamente por onAuthStateChange
            if (!window.location.pathname.endsWith('login_register.html')) {
                 window.location.href = 'login_register.html';
            }
        }
    });
} else {
    console.warn("Elemento logout-button no encontrado.");
}

// CSS para el botón de reenviar dentro de la notificación
const style = document.createElement('style');
style.textContent = `
    .link-button {
        background: none;
        border: none;
        color: var(--login-primary-accent);
        text-decoration: underline;
        cursor: pointer;
        padding: 0;
        font-size: inherit;
        font-family: inherit;
    }
    .link-button:hover {
        color: var(--accent-hover-color);
    }
`;
document.head.appendChild(style);


// Inicializar Supabase y la UI cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initSupabaseInAuth);
