const m3uFile = document.getElementById('m3uFile');
const m3uUrl = document.getElementById('m3uUrl');
const loadButton = document.getElementById('loadButton');
const channelList = document.getElementById('channelList');
const videoContainer = document.getElementById('videoContainer');
const errorMessage = document.getElementById('errorMessage');
const searchInput = document.getElementById('searchInput');
let currentPlayer = null;

m3uFile.addEventListener('change', handleFileSelect);
loadButton.addEventListener('click', handleUrlLoad);
searchInput.addEventListener('input', handleSearch);

function handleFileSelect(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        const channels = parseM3U(content);
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
                const channels = parseM3U(content);
                displayChannels(channels);
            })
            .catch(error => {
                errorMessage.textContent = `Error loading M3U: ${error}`;
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
    errorMessage.textContent = '';
    if (currentPlayer) {
        currentPlayer.destroy();
        currentPlayer = null;
    }
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
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            video.play();
        });
        hls.on(Hls.Events.ERROR, function(event, data) {
            if (data.fatal) {
                errorMessage.textContent = `HLS Error: ${data.type}`;
                hls.destroy();
            }
        });
        currentPlayer = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.addEventListener('loadedmetadata', function() {
            video.play();
        });
    } else {
        errorMessage.textContent = 'Your browser does not support HLS';
    }
}

function playMPEGTS(video, url) {
    if (mpegts.getFeatureList().mseLivePlayback) {
        const player = mpegts.createPlayer({
            type: 'mpegts',
            url: url,
            isLive: true,
        });
        player.attachMediaElement(video);
        player.load();
        player.play();
        player.on(mpegts.Events.ERROR, function(error) {
            errorMessage.textContent = `MPEG-TS Error: ${error}`;
        });
        currentPlayer = player;
    } else {
        errorMessage.textContent = 'Your browser does not support MPEG-TS';
    }
}