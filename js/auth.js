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
const authStatus = document.getElementById('auth-status');

// Nuevos elementos para la UI de tarjeta flip
const flipCardContainer = document.getElementById('flipCard');
const authFormsStatusContainer = document.getElementById('auth-forms-status-container');

// Función para actualizar la UI
async function updateAuthUI() {
    if (!supabaseClient || !supabaseClient.auth) {
        console.error('Cliente Supabase o módulo auth no está listo para updateAuthUI.');
        if (authStatus) authStatus.textContent = 'Supabase no está listo. Intentando...';
        return;
    }

    const { data: { user } } = await supabaseClient.auth.getUser();

    if (user) {
        // Usuario está logueado
        if (authStatus) authStatus.textContent = `Sesión iniciada como: ${user.email}`;
        if (logoutButton) logoutButton.style.display = 'block';

        // Ocultar la tarjeta flip y mostrar el contenedor de estado/logout
        if (flipCardContainer) flipCardContainer.style.display = 'none';
        if (authFormsStatusContainer) authFormsStatusContainer.style.display = 'block'; // Asegúrate que este se muestre

        // Redirigir al perfil solo si estamos en login_register.html
        if (window.location.pathname.endsWith('login_register.html')) {
            window.location.href = 'barber_profile.html';
        }
    } else {
        // Usuario NO está logueado
        if (authStatus) authStatus.textContent = ''; // O "No hay sesión iniciada." si prefieres
        if (logoutButton) logoutButton.style.display = 'none';

        // Mostrar la tarjeta flip y ocultar el contenedor de estado/logout
        if (flipCardContainer) flipCardContainer.style.display = 'block'; // O 'relative' si ese era su display original
        if (authFormsStatusContainer) authFormsStatusContainer.style.display = 'none';

        // Ya no es necesario mostrar/ocultar registerForm y loginForm individualmente,
        // ya que están dentro de flipCardContainer.
    }
}

// Event Listener para el registro
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        if (!supabaseClient) {
            if (authStatus) authStatus.textContent = 'Error: Supabase no está listo.';
            return;
        }

        if (authStatus) authStatus.textContent = 'Registrando...';
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
        });

        if (error) {
            if (authStatus) authStatus.textContent = `Error al registrarse: ${error.message}`;
            console.error('Error de registro:', error.message);
        } else {
            if (authStatus) authStatus.textContent = `¡Registro exitoso! Revisa tu email para confirmar.`;
            console.log('Usuario registrado:', data.user);
            // No es necesario llamar a updateAuthUI() aquí directamente si la confirmación por email es requerida,
            // el estado cambiará una vez el usuario confirme y reingrese.
        }
    });
} else {
    console.warn("Elemento register-form no encontrado. Asegúrate que el ID es correcto en login_register.html.");
}

// Event Listener para el inicio de sesión
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        if (!supabaseClient) {
            if (authStatus) authStatus.textContent = 'Error: Supabase no está listo.';
            return;
        }

        if (authStatus) authStatus.textContent = 'Iniciando sesión...';
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            if (authStatus) authStatus.textContent = `Error al iniciar sesión: ${error.message}`;
            console.error('Error de login:', error.message);
        } else {
            // No es necesario poner el mensaje aquí, updateAuthUI se encargará y redirigirá
            console.log('Usuario logueado:', data.user);
            // updateAuthUI(); // Se llama automáticamente por onAuthStateChange, pero una llamada explícita puede acelerar la redirección.
        }
    });
} else {
    console.warn("Elemento login-form no encontrado. Asegúrate que el ID es correcto en login_register.html.");
}

// Event Listener para cerrar sesión
if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        if (!supabaseClient) {
            console.error('Supabase no está listo para cerrar sesión.');
            return;
        }
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            if (authStatus) authStatus.textContent = `Error al cerrar sesión: ${error.message}`;
            console.error('Error de logout:', error.message);
        } else {
            console.log('Sesión cerrada');
            // updateAuthUI(); // Se llama automáticamente por onAuthStateChange
            // Forzar redirección a la página de login/registro si es necesario.
            if (!window.location.pathname.endsWith('login_register.html')) {
                 window.location.href = 'login_register.html';
            }
        }
    });
} else {
    console.warn("Elemento logout-button no encontrado. Asegúrate que el ID es correcto.");
}

// Inicializar Supabase y la UI cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initSupabaseInAuth);


