// Load API key on startup
document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveButton = document.getElementById('saveSettings');
    const apiKeyGuideLink = document.getElementById('apiKeyGuideLink');
    const apiKeyGuideModal = document.getElementById('apiKeyGuideModal');
    const closeModal = document.getElementById('closeModal');
    const devPortalLink = document.getElementById('devportal');

    try {
        const savedApiKey = await window.api.loadSetting('apiKey');
        if (savedApiKey) {
            apiKeyInput.value = savedApiKey;
        }
    } catch (error) {
        console.error('Error loading API key:', error);
    }

    apiKeyGuideLink.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent default link behavior
        apiKeyGuideModal.style.display = 'block';
    });

    // Close modal when the close button is clicked
    closeModal.addEventListener('click', () => {
        apiKeyGuideModal.style.display = 'none';
    });

    // Close modal when clicking outside the modal content
    window.addEventListener('click', (event) => {
        if (event.target === apiKeyGuideModal) {
            apiKeyGuideModal.style.display = 'none';
        }
    });

    // Save API key
    saveButton.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            alert('API key cannot be empty.');
            return;
        }

        try {
            await window.api.saveSetting('apiKey', apiKey);
            alert('API key saved successfully.');
        } catch (error) {
            console.error('Error saving API key:', error);
            alert('An error occurred while saving the API key.');
        }
    });

    devPortalLink.addEventListener('click', (event) => {
        event.preventDefault();
        window.api.openExternal(devPortalLink.href);
    });
});


