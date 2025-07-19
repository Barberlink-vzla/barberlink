// js/imageCropper.js - VERSIÓN REFACTORIZADA Y MÁS SEGURA

const ImageCropper = {
    // Propiedades para guardar el estado
    modalOverlay: null,
    cropperContainer: null,
    saveBtn: null,
    cancelBtn: null,
    croppieInstance: null,
    successCallback: null,

    /**
     * Esta es la función principal que inicializa todo.
     * Busca los elementos, crea Croppie y añade los listeners.
     */
    init: function() {
        // 1. Buscamos los elementos del DOM. Ahora es seguro porque `init` se llama desde DOMContentLoaded.
        this.modalOverlay = document.getElementById('cropper-modal-overlay');
        this.cropperContainer = document.getElementById('cropper-container');
        this.saveBtn = document.getElementById('cropper-save-btn');
        this.cancelBtn = document.getElementById('cropper-cancel-btn');

        // Verificación de seguridad
        if (!this.cropperContainer) {
            console.error("Cropper Error: El contenedor #cropper-container sigue sin encontrarse. Verifica que el ID en barber_profile.html es correcto.");
            return;
        }

        // 2. Creamos la instancia de Croppie
        this.croppieInstance = new Croppie(this.cropperContainer, {
            viewport: { width: 250, height: 250, type: 'square' },
            boundary: { width: '100%', height: 300 },
            showZoomer: true,
            enableOrientation: true
        });

        // 3. Configuramos los eventos de los botones
        this.setupEventListeners();

        console.log("ImageCropper (versión robusta) inicializado correctamente. ✂️");
    },

    /**
     * Configura los listeners para los botones del modal.
     */
    setupEventListeners: function() {
        if (this.saveBtn) this.saveBtn.addEventListener('click', () => this.cropAndSave());
        if (this.cancelBtn) this.cancelBtn.addEventListener('click', () => this.close());
        if (this.modalOverlay) {
            this.modalOverlay.addEventListener('click', (e) => {
                if (e.target === this.modalOverlay) this.close();
            });
        }
    },

    /**
     * Abre el modal y carga una imagen desde un objeto File.
     */
    open: function(file, callback) {
        if (!this.croppieInstance) {
             console.error("Croppie no está inicializado. No se puede abrir.");
             return;
        }
        if (!file || !this.modalOverlay) return;

        this.successCallback = callback;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.croppieInstance.bind({ url: e.target.result })
                .then(() => console.log('Croppie bind complete'));
        };
        reader.readAsDataURL(file);

        this.modalOverlay.classList.add('active');
    },

    /**
     * Cierra el modal y limpia el estado.
     */
    close: function() {
        if (this.modalOverlay) this.modalOverlay.classList.remove('active');
        this.successCallback = null;
    },

    /**
     * Procesa la imagen, la recorta y ejecuta el callback de éxito.
     */
    cropAndSave: async function() {
        if (!this.croppieInstance || !this.successCallback) return;

        try {
            const croppedBlob = await this.croppieInstance.result({
                type: 'blob',
                size: { width: 500, height: 500 },
                format: 'jpeg',
                quality: 0.9,
                circle: false
            });
            this.successCallback(croppedBlob);
            this.close();
        } catch (error) {
            console.error("Error al recortar la imagen:", error);
            alert("Hubo un problema al procesar la imagen.");
        }
    }
};

// Punto de entrada: esperamos a que el DOM esté listo y LUEGO llamamos a la función init.
document.addEventListener('DOMContentLoaded', () => {
    ImageCropper.init();
});
