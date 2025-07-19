// js/imageCropper.js

const ImageCropper = (() => {
    // Referencias a los elementos del DOM del modal
    const modalOverlay = document.getElementById('cropper-modal-overlay');
    const cropperContainer = document.getElementById('cropper-container');
    const saveBtn = document.getElementById('cropper-save-btn');
    const cancelBtn = document.getElementById('cropper-cancel-btn');

    let croppieInstance = null;
    let successCallback = null;

    /**
     * Inicializa Croppie dentro del contenedor del modal.
     */
    function _init() {
        if (!cropperContainer) {
            console.error("Cropper Error: El contenedor #cropper-container no fue encontrado.");
            return;
        }

        croppieInstance = new Croppie(cropperContainer, {
            // El viewport es el área de recorte visible
            viewport: { width: 250, height: 250, type: 'square' }, // 1:1 Aspect Ratio
            // El boundary es el contenedor completo de la imagen
            boundary: { width: '100%', height: 300 },
            // Muestra un helper visual para el zoom
            showZoomer: true,
            // Permite cambiar la orientación en móviles
            enableOrientation: true
        });
        console.log("ImageCropper inicializado. ✂️");
    }

    /**
     * Abre el modal y carga una imagen desde un objeto File.
     * @param {File} file - El archivo de imagen seleccionado por el usuario.
     * @param {Function} callback - La función a ejecutar con el blob recortado.
     */
    function open(file, callback) {
        if (!croppieInstance) _init();
        if (!file || !modalOverlay) return;

        successCallback = callback; // Guardamos la función a llamar al guardar

        const reader = new FileReader();
        reader.onload = (e) => {
            croppieInstance.bind({
                url: e.target.result
            }).then(() => {
                console.log('Croppie bind complete');
            });
        };
        reader.readAsDataURL(file);

        modalOverlay.classList.add('active');
    }

    /**
     * Cierra el modal y limpia el estado.
     */
    function close() {
        if (modalOverlay) modalOverlay.classList.remove('active');
        successCallback = null; // Limpiamos el callback
    }

    /**
     * Procesa la imagen, la recorta y ejecuta el callback de éxito.
     */
    async function _cropAndSave() {
        if (!croppieInstance || !successCallback) return;

        try {
            // Obtenemos la imagen recortada como un Blob (ideal para subir)
            const croppedBlob = await croppieInstance.result({
                type: 'blob',
                size: { width: 500, height: 500 }, // Tamaño final de la imagen
                format: 'jpeg',
                quality: 0.9, // Buena calidad, buen tamaño de archivo
                circle: false
            });

            // Ejecutamos la función que nos pasaron, enviándole el blob
            successCallback(croppedBlob);

            // Cerramos el modal
            close();

        } catch (error) {
            console.error("Error al recortar la imagen:", error);
            alert("Hubo un problema al procesar la imagen.");
        }
    }

    /**
     * Configura los listeners para los botones del modal.
     */
    function setupEventListeners() {
        if (saveBtn) saveBtn.addEventListener('click', _cropAndSave);
        if (cancelBtn) cancelBtn.addEventListener('click', close);
        if(modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) close();
            });
        }
    }

    // Auto-inicializar al cargar el script
    document.addEventListener('DOMContentLoaded', () => {
        _init();
        setupEventListeners();
    });

    // Exponemos públicamente solo la función `open`
    return {
        open: open
    };
})();
