// js/imageCropper.js

const ImageCropper = (() => {
    // 1. Declaramos las variables aquí, pero SIN asignarles valor.
    //    Las dejaremos vacías hasta que el DOM esté listo.
    let modalOverlay, cropperContainer, saveBtn, cancelBtn;
    
    let croppieInstance = null;
    let successCallback = null;

    // 2. Ahora, la ASIGNACIÓN y la inicialización ocurren DENTRO de este bloque.
    //    Este evento solo se dispara cuando todo el HTML ha sido cargado.
    document.addEventListener('DOMContentLoaded', () => {
        // Asignamos los elementos del DOM aquí
        modalOverlay = document.getElementById('cropper-modal-overlay');
        cropperContainer = document.getElementById('cropper-container');
        saveBtn = document.getElementById('cropper-save-btn');
        cancelBtn = document.getElementById('cropper-cancel-btn');

        // Solo después de encontrar los elementos, llamamos a las funciones
        _init();
        setupEventListeners();
    });

    /**
     * Inicializa Croppie dentro del contenedor del modal.
     * Esta función ahora es llamada de forma segura desde 'DOMContentLoaded'.
     */
    function _init() {
        if (!cropperContainer) {
            // Este error ya no debería aparecer, pero lo dejamos como medida de seguridad.
            console.error("Cropper Error: El contenedor #cropper-container no fue encontrado.");
            return;
        }

        croppieInstance = new Croppie(cropperContainer, {
            viewport: { width: 250, height: 250, type: 'square' },
            boundary: { width: '100%', height: 300 },
            showZoomer: true,
            enableOrientation: true
        });
        console.log("ImageCropper inicializado correctamente. ✂️");
    }

    /**
     * Abre el modal y carga una imagen desde un objeto File.
     * (Esta función no necesita cambios)
     */
    function open(file, callback) {
        if (!croppieInstance) {
             console.error("Croppie no está inicializado. No se puede abrir.");
             return;
        }
        if (!file || !modalOverlay) return;

        successCallback = callback;

        const reader = new FileReader();
        reader.onload = (e) => {
            croppieInstance.bind({ url: e.target.result })
                           .then(() => console.log('Croppie bind complete'));
        };
        reader.readAsDataURL(file);

        modalOverlay.classList.add('active');
    }

    /**
     * Cierra el modal y limpia el estado.
     * (Esta función no necesita cambios)
     */
    function close() {
        if (modalOverlay) modalOverlay.classList.remove('active');
        successCallback = null;
    }

    /**
     * Procesa la imagen, la recorta y ejecuta el callback de éxito.
     * (Esta función no necesita cambios)
     */
    async function _cropAndSave() {
        if (!croppieInstance || !successCallback) return;

        try {
            const croppedBlob = await croppieInstance.result({
                type: 'blob',
                size: { width: 500, height: 500 },
                format: 'jpeg',
                quality: 0.9,
                circle: false
            });
            successCallback(croppedBlob);
            close();
        } catch (error) {
            console.error("Error al recortar la imagen:", error);
            alert("Hubo un problema al procesar la imagen.");
        }
    }

    /**
     * Configura los listeners para los botones del modal.
     * (Esta función no necesita cambios)
     */
    function setupEventListeners() {
        if (saveBtn) saveBtn.addEventListener('click', _cropAndSave);
        if (cancelBtn) cancelBtn.addEventListener('click', close);
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) close();
            });
        }
    }

    // Exponemos públicamente solo la función `open`
    return {
        open: open
    };
})();
