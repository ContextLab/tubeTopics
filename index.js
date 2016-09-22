var fs = require('fs')
var path = require('path')
var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');
var lda = require('lda');
var gspeech = require('gspeech-api')

// ideas for functions:
// 1. getTranscripts - takes a single youtube url or array of youtube urls and returns transcript of the video
// 2. getTopics - inputs are transcript(s). option to supply your own model.  if no model is provided, the model will be based on the collection of transcripts. returns topic weights for each transcript.

module.exports = tubeTopics;

function tubeTopics(options) {
    // optional params
    options = options || {};

    // private data
    var audioOutputPath = opt.audioOutputPath || path.resolve(__dirname, 'sound.mp4');

    function getTranscripts(urls, options) {
        options = options || {};

        if (typeof urls === 'string'){
          urls = [urls]
        };

        var audioOutput = path.resolve(__dirname, 'sound.mp4');

        urls.forEach(function(url) {
            ytdl(url, {
                    filter: function(f) {
                        return f.container === 'mp4' && !f.encoding;
                    }
                })
                // Write audio to file since ffmpeg supports only one input stream.
                .pipe(fs.createWriteStream(audioOutput))
                .on('finish', function() {
                    ffmpeg()
                        .input(ytdl(url, {
                            filter: function(f) {
                                return f.container === 'mp4' && !f.audioEncoding;
                            }
                        }))
                        .videoCodec('copy')
                        .input(audioOutput)
                        .audioCodec('copy')
                        .save(path.resolve(__dirname, 'output.mp4'))
                        .on('error', console.error)
                        .on('progress', function(progress) {
                            process.stdout.cursorTo(0);
                            process.stdout.clearLine(1);
                            process.stdout.write(progress.timemark);
                        }).on('end', function() {
                            gspeech.recognize(audioOutput, function(err, data) {
                                if (err)
                                    console.error(err);
                                var videoTranscript = '';
                                for (var i = 0; i < data.timedTranscript.length; i++) {
                                    var videoTranscript = videoTranscript.concat(' ', data.timedTranscript[i].text);
                                }
                                videoTranscripts.push(videoTranscript)
                            });
                        });
                });
        });
        return videoTranscripts
    };

    function getTopicsFromTranscripts(transcripts,options){
      options = options || {};

      var numTopics = options.numTopics || 2;
      var numTerms = options.numTerms || 5;

      return lda([transcripts],numTopics,numTerms)

    }

    function getTopicsFromURLs(urls,options){
      options = options || {};

      var numTopics = options.numTopics || 2;
      var numTerms = options.numTerms || 5;

      var transcripts = getTranscripts(urls, options);

      return lda([transcripts],numTopics,numTerms)

    }

    // API/data for end-user
    return {
        getTranscripts: getTranscripts,
        getTopicsFromTranscripts: getTopicsFromTranscripts,
        getTopicsFromURLS: getTopicsFromURLS
    }
    
}
