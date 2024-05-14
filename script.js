const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let dBResults = {};
let current_frequency = 0;

let mediaStream = null;
let analyser = null;
let javascriptNode = null;

let achxChart = null;
let frequencies = [];
let averages = [];

let stop = false;

function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablink");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}

function generateSound(frequency, duration) {
    return new Promise((resolve, reject) => {
        const oscillator = audioContext.createOscillator();
        const type = document.getElementById("signalType").value;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(1, audioContext.currentTime);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();

        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration / 1000);

        setTimeout(() => {
            oscillator.stop();
            resolve();
        }, duration);
    });
}

function start() {
    return new Promise((resolve, reject) => {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaStream = stream;
                const audioContext = new AudioContext();
                analyser = audioContext.createAnalyser();
                const microphone = audioContext.createMediaStreamSource(stream);
                javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

                analyser.smoothingTimeConstant = 0.8;
                analyser.fftSize = 1024;

                microphone.connect(analyser);
                analyser.connect(javascriptNode);
                javascriptNode.connect(audioContext.destination);

                javascriptNode.onaudioprocess = function() {
                    const array = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(array);

                    let values = 0;
                    const length = array.length;
                    for (let i = 0; i < length; i++) {
                        values += array[i];
                    }

                    let mean = values / length;
                    let rms = Math.sqrt(mean);
                    let db = 20 * Math.log10(rms / 255);
                    if (current_frequency !== 0) {
                        dBResults[current_frequency].push(db);
                    }
                }
                resolve();
            })
            .catch(err => {
                console.log("The following error occurred: " + err.name)
                reject(err);
            });
    });
}

async function playSoundNTimes(all_frequencies, duration) {
    for (const frequency of all_frequencies) {
        if (stop) break;

        dBResults[frequency] = [];
        current_frequency = frequency;
        await generateSound(frequency, duration);

        let dBs = dBResults[frequency].filter(dB => isFinite(dB));
        let avg = dBs.reduce((prev, dB) => prev + dB, 0) / dBs.length;

        frequencies.push(frequency);
        averages.push(avg);

        console.log("Average result for frequency " + frequency + " Hz:", avg);
        dBResults[frequency] = [];
        updateACHXChart();
    }
}

function updateACHXChart() {
    if (!achxChart) {
        achxChart = new Chart(document.getElementById('achxChart'), {
            type: 'line',
            data: {
                labels: frequencies.map((freq, index) => freq % 10 === 0 ? freq + ' Hz' : ''),
                datasets: [{
                    label: 'Amplitude-Frequency Response',
                    data: averages,
                    borderColor: 'rgb(75, 192, 192)',
                    borderWidth: 2,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    pointRadius: 3,
                    pointBackgroundColor: 'rgba(75, 192, 192, 1)',
                    pointBorderColor: 'rgba(75, 192, 192, 1)',
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: 'rgba(75, 192, 192, 1)',
                    pointHoverBorderColor: 'rgba(75, 192, 192, 1)',
                    tension: 0.6
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Amplitude (dB SPL)',
                            font: {
                                size: 13,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            font: {
                                size: 14
                            }
                        }
                    },
                    x: {
                        offset: false,
                        title: {
                            display: true,
                            text: 'Frequency (Hz)',
                            font: {
                                size: 13,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            stepSize: 10,
                            font: {
                                size: 14
                            },
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            font: {
                                size: 14
                            }
                        }
                    }
                }
            }
        });
    } else {
        achxChart.data.labels = frequencies.map((freq, index) => freq % 10 === 0 ? freq + ' Hz' : '');
        achxChart.data.datasets[0].data = averages;
        achxChart.update();
    }
}

function clearCanvas() {
    const canvas = document.getElementById('achxChart');
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (achxChart) {
        achxChart.destroy();
    }
    achxChart = null;
    frequencies = [];
    averages = [];
}

function stopAnalysis() {
    stop = true;
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    document.getElementById("saveButton").style.display = "block";
    document.getElementById("fileName").style.display = "block";
}

async function saveChartAsImage() {
    if (achxChart) {
        const canvas = document.getElementById('achxChart');
        const url = canvas.toDataURL('image/png');
        const fileName = document.getElementById('fileName').value || 'chart';
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.png`;
        link.click();
    }
}

document.getElementById("saveButton").addEventListener("click", saveChartAsImage);

document.getElementById("startButton").addEventListener("click", async () => {
    stop = false;

    document.getElementById("saveButton").style.display = "none";
    document.getElementById("fileName").style.display = "none";

    clearCanvas();
    updateACHXChart();

    const startFrequency = parseInt(document.getElementById("startFrequency").value);
    const endFrequency = parseInt(document.getElementById("endFrequency").value);
    const frequencyDuration = parseInt(document.getElementById("frequencyDuration").value);
    const step = parseInt(document.getElementById("step").value);

    const allFrequencies = [];
    const frequencyLabels = [];
    for (let frequency = startFrequency; frequency <= endFrequency; frequency += step) {
        allFrequencies.push(frequency);
    }

    await start();
    console.log(frequencyDuration);
    await playSoundNTimes(allFrequencies, frequencyDuration);

    stopAnalysis();
});

document.getElementById("stopButton").addEventListener("click", () => {
    stopAnalysis();
    updateACHXChart();
});
