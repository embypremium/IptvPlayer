// Declaración de variables
let currentPlayer = null;
let channels = [];
let retryCount = 0;
const MAX_RETRIES = 3;

let bufferLength = 30; // valor predeterminado
let maxBufferLength = 60; // valor predeterminado

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    // Obtener referencias a los elementos del DOM
    const m3uFile = document.getElementById('m3uFile');
    const m3uUrl = document.getElementById('m3uUrl');
    const loadButton = document.getElementById('loadButton');
    const channelList = document.getElementById('channelList');
    const videoContainer = document.getElementById('videoContainer');
    const errorMessage = document.getElementById('errorMessage');
    const searchInput = document.getElementById('searchInput');

    // Crear y agregar elementos de configuración avanzada
    const settingsDiv = document.createElement('div');
    settingsDiv.innerHTML = `
        <h3>Advanced Settings</h3>
        <label for="bufferLength">Buffer Length (seconds):</label>
        <input type="number" id="bufferLength" min="5" max="60" value="${bufferLength}">
        <label for="maxBufferLength">Max Buffer Length (seconds):</label>
        <input type="number" id="maxBufferLength" min="30" max="300" value="${maxBufferLength}">
    `;
    
    // Insertar settingsDiv en una ubicación apropiada
    if (videoContainer) {
        videoContainer.parentNode.insertBefore(settingsDiv, videoContainer);
    } else {
        document.body.appendChild(settingsDiv);
    }

    const bufferLengthInput = document.getElementById('bufferLength');
    const maxBufferLengthInput = document.getElementById('maxBufferLength');

    // Agregar event listeners
    if (m3uFile) m3uFile.addEventListener('change', handleFileSelect);
    if (loadButton) loadButton.addEventListener('click', handleUrlLoad);
    if (searchInput) searchInput.addEventListener('input', handleSearch);
    if (bufferLengthInput) bufferLengthInput.addEventListener('change', updateBufferSettings);
    if (maxBufferLengthInput) maxBufferLengthInput.addEventListener('change', updateBufferSettings);

    // Funciones del reproductor
    function handleFileSelect(event) {
        const file = event.target.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            channels = parseM3U(content);
            displayChannels(channels);
        };
        reader.readAsText(file);
    }

    function handleUrlLoad() {
        const url = m3uUrl.value.trim();
        if (url) {
            fetch(url)
                .then(response => response.text())
                .then(content => {
                    channels = parseM3U(content);
                    displayChannels(channels);
                })
                .catch(error => {
                    showError(`Error loading M3U: ${error}`);
                });
        }
    }

    function parseM3U(content) {
        const lines = content.split('\n');
        const channels = [];
        let currentChannel = {};

        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('#EXTINF:')) {
                const parts = line.split(',');
                currentChannel.name = parts[parts.length - 1].trim();
            } else if (line.startsWith('http')) {
                currentChannel.url = line;
                channels.push(currentChannel);
                currentChannel = {};
            }
        }

        return channels;
    }

    function displayChannels(channels) {
        if (!channelList) return;
        channelList.innerHTML = '<option value="">Select a channel</option>';
        channels.forEach((channel, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = channel.name;
            channelList.appendChild(option);
        });

        channelList.addEventListener('change', (event) => {
            const selectedIndex = event.target.value;
            if (selectedIndex !== '') {
                playChannel(channels[selectedIndex].url);
            }
        });
    }

    function handleSearch() {
        const searchTerm = searchInput.value.toLowerCase();
        const options = channelList.options;

        for (let i = 1; i < options.length; i++) {
            const optionText = options[i].text.toLowerCase();
            if (optionText.includes(searchTerm)) {
                options[i].style.display = '';
            } else {
                options[i].style.display = 'none';
            }
        }
    }

    function playChannel(url) {
        clearError();
        retryCount = 0;
        if (currentPlayer) {
            currentPlayer.destroy();
            currentPlayer = null;
        }
        if (!videoContainer) return;
        videoContainer.innerHTML = '<video id="videoPlayer" controls></video>';
        const video = document.getElementById('videoPlayer');

        if (url.includes('.m3u8')) {
            playHLS(video, url);
        } else {
            playMPEGTS(video, url);
        }
    }

    function playHLS(video, url) {
        if (Hls.isSupported()) {
            const hls = new Hls({
                maxBufferLength: bufferLength,
                maxMaxBufferLength: maxBufferLength,
                maxBufferSize: 60 * 1000 * 1000,
                maxBufferHole: 0.5,
                lowLatencyMode: true
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                video.play().catch(e => showError(`Playback error: ${e.message}`));
            });
            hls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            showError(`Network error: ${data.details}`);
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            showError(`Media error: ${data.details}`);
                            hls.recoverMediaError();
                            break;
                        default:
                            showError(`HLS Error: ${data.type} - ${data.details}`);
                            hls.destroy();
                            break;
                    }
                }
            });
            currentPlayer = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.addEventListener('loadedmetadata', function() {
                video.play().catch(e => showError(`Playback error: ${e.message}`));
            });
        } else {
            showError('Your browser does not support HLS');
        }
    }

    function playMPEGTS(video, url) {
        if (mpegts.getFeatureList().mseLivePlayback) {
            const player = mpegts.createPlayer({
                type: 'mpegts',
                url: url,
                isLive: true,
                enableStashBuffer: false,
                stashInitialSize: 128,
                enableWorker: true,
                lazyLoad: false,
                autoCleanupSourceBuffer: true,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            player.attachMediaElement(video);
            player.load();
            player.play().catch(error => {
                console.error("Playback error:", error);
                retryPlayback(url);
            });
            player.on(mpegts.Events.ERROR, function(error) {
                console.error("MPEG-TS Error:", error);
                if (error === 'NetworkError') {
                    retryPlayback(url);
                } else {
                    showError(`MPEG-TS Error: ${error}`);
                }
            });
            currentPlayer = player;
        } else {
            showError('Your browser does not support MPEG-TS');
        }
    }

    function retryPlayback(url) {
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`Retrying playback (${retryCount}/${MAX_RETRIES})...`);
            setTimeout(() => playChannel(url), 2000 * retryCount);
        } else {
            showError('Failed to play the channel after multiple attempts. Please try again later.');
        }
    }

    function showError(message) {
        console.error(message);
        if (errorMessage) errorMessage.textContent = message;
    }

    function clearError() {
        if (errorMessage) errorMessage.textContent = '';
    }

    function updateBufferSettings() {
        bufferLength = parseInt(bufferLengthInput.value);
        maxBufferLength = parseInt(maxBufferLengthInput.value);
        if (currentPlayer && currentPlayer instanceof Hls) {
            currentPlayer.config.maxBufferLength = maxBufferLength;
            currentPlayer.config.maxMaxBufferLength = maxBufferLength;
        }
    }

    // Add some basic error recovery
    setInterval(() => {
        if (currentPlayer && currentPlayer instanceof Hls && currentPlayer.media.readyState === 0) {
            console.log('Attempting to recover from stalled playback');
            currentPlayer.recoverMediaError();
        }
    }, 5000);
});