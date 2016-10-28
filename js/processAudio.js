////////////////////////////////////////////////////////////////////////////
// Code for processing audio files /////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////
var fs = require('fs')
var path = require('path')
var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');
var temp = require("temp").track();
var async = require('async');
var google = require('googleapis');
var speech = google.speech('v1beta1').speech;

module.exports = {

    // function to download audio from a youtube link
    downloadAudio: function(url) {
        return new Promise(function(resolve, reject) {
            var audioOutputPath = path.resolve(__dirname, 'sound.mp4');
            console.log('Downloading video and filtering the audio...')
            ytdl(url, {
                    filter: function(f) {
                        return f.container === 'mp4' && !f.encoding;
                    }
                })
                .pipe(fs.createWriteStream(audioOutputPath))
                .on('finish', function() {
                    console.log('Download finished.')
                    file = audioOutputPath;
                    resolve(audioOutputPath)
                })
        })
    },

    getAudioSegmentParams: function(file,seglen) {
        console.log('Getting audio segment params...')
        return new Promise(function(resolve, reject) {
            ffmpeg.ffprobe(file, function(err, info) {
                var audioSegments = []
                var totalDuration = info.format.duration;
                var segments = false
                maxDuration = seglen;
                if (segments) {
                    for (var i = 0; i < segments.length; i++) {
                        var duration = (i == segments.length - 1) ? totalDuration - segments[i] : segments[i + 1] - segments[i];
                        if (duration < 0) {
                            callback(new Error("segments must be a sorted array of start times, \
    each less than the total length of your audio"));
                        }
                        var curStart = segments[i];
                        while (duration > maxDuration + .001) {
                            audioSegments.push({
                                'start': curStart,
                                'duration': maxDuration
                            });
                            duration -= maxDuration;
                            curStart += maxDuration;
                        }
                        audioSegments.push({
                            'start': curStart,
                            'duration': duration
                        });
                    }
                } else {
                    var numSegments = Math.ceil(totalDuration / maxDuration);
                    for (var i = 0; i < numSegments; i++) {
                        audioSegments.push({
                            'start': maxDuration * i,
                            'duration': maxDuration
                        });
                    }
                }
                console.log('Returning audio segment params')
                resolve(audioSegments)
            })
        })
    },

    processSegment: function(data, callback) {
        console.log('Processing segment: ', data.start)
        var start = data.start;
        var dur = data.duration;
        var tmpFile = temp.path({
            suffix: '.flac'
        });

        // Convert segment of audio file into .flac file
        ffmpeg()
            .input(file)
            .setStartTime(start)
            .duration(dur)
            .output(tmpFile)
            .audioFrequency(16000)
            .audioChannels(1)
            .toFormat('flac')
            .on('error', function(err) {
                console.log(err);
            })
            .on('end', function() {
                console.log('Finished processing: ', data.start)
                getTranscript(tmpFile).then((words) => {
                    // computeTopicWeights(transcript, model, {
                    //     dur: dur,
                    //     start: start
                    // }).then((results) => {
                    //     callback(null, results)
                    // })
                    callback(null,{
                      dur: dur,
                      start: start,
                      text: words
                    })
                })
            })
            .run();

    },

    decodeSpeech: function(audioSegments) {
        return new Promise(function(resolve, reject) {
            var limitConcurrent = 20;
            async.mapLimit(audioSegments, limitConcurrent, audioProcessor.processSegment, function(err, results) {
                if (err)
                    console.log('Error:',err);
                // var timedTopics = results.sort(function(a, b) {
                //     if (a.start < b.start) return -1;
                //     if (a.start > b.start) return 1;
                //     return 0;
                // });
                resolve(results)
            });
        })
    }
};


////////////////////////////////////////////////////////////////////////////
// GOOGLE SPEECH CODE //////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

function getTranscript(inputFile) {
    return new Promise(function(resolve, reject) {
        var requestPayload;
        async.waterfall([
            function(cb) {
                prepareRequest(inputFile, cb);
            },
            function(payload, cb) {
                requestPayload = payload;
                getAuthClient(cb);
            },
            function sendRequest(authClient, cb) {
                speech.syncrecognize({
                    auth: authClient,
                    resource: requestPayload
                }, function(err, result) {
                    if (err) {
                        console.log(err)
                        return cb(err);
                    }
                    // console.log('result:', JSON.stringify(result, null, 2));
                    // console.log(JSON.stringify(result, null, 2))
                    words = [];
                    if (JSON.stringify(result, null, 2) != '{}') {
                        result.results.forEach(segment => {
                            segment.alternatives[0].transcript.trim().split(" ").forEach(word => {
                                if (word != "") {
                                    words.push(word.toUpperCase())
                                }
                            })
                        })
                    }
                    resolve(words)
                });
            }
        ]);
    })
};

function getAuthClient(callback) {
    google.auth.getApplicationDefault(function(err, authClient) {
        if (err) {
            return callback(err);
        }
        if (authClient.createScopedRequired && authClient.createScopedRequired()) {
            authClient = authClient.createScoped([
                'https://www.googleapis.com/auth/cloud-platform',
                'https://www.googleapis.com/auth/youtube.force-ssl'
            ]);
        }

        return callback(null, authClient);
    });
}

function prepareRequest(inputFile, callback) {
    fs.readFile(inputFile, function(err, audioFile) {
        if (err) {
            return callback(err);
        }
        var encoded = new Buffer(audioFile).toString('base64');
        var payload = {
            config: {
                encoding: 'FLAC',
                sampleRate: 16000
            },
            audio: {
                content: encoded
            }
        };
        return callback(null, payload);
    })
};
