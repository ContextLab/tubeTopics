audioProcessor = require('./js/processAudio.js')
topicModel = require('./js/topicModel.js')
youtube = require('./js/youtube.js')

var tubeTopics = function() {

    // loads in when the package is initialized
    model = topicModel.loadModel()

    ////////////////////////////////////////////////////////////////////////////
    // PUBLIC FUNCTIONS ////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // function to get topic weights from a youtube url
    function getTopicWeightsFromURL(url) {
        return new Promise((resolve, reject) => {
            youtube.checkForTranscriptOnYoutube(url).then(result => {
                if (result == null) {
                    console.log('Transcript not available on Youtube.  Sending to Google Speech...')
                    getSegmentsViaGoogleSpeech(url).then(segments => {
                        topicModel.getTopics(segments, model).then(result => {
                            resolve(result)
                        })
                    })
                } else {
                    console.log('Transcript found on Youtube.  Retrieving it...')
                    getSegmentsViaYoutube(result, url).then(segments => {
                        topicModel.getTopics(segments, model).then(result => {
                            resolve(result)
                        })
                    })
                }
            })
        })
    };

    ////////////////////////////////////////////////////////////////////////////
    // PRIVATE FUNCTIONS ///////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////
    
    function getSegmentsViaGoogleSpeech(url) {
        return new Promise((resolve, reject) => {
            audioProcessor.downloadAudio(url).then((audioFilePath) => {
                audioProcessor.getAudioSegmentParams(audioFilePath).then((segmentParams) => {
                    audioProcessor.decodeSpeech(segmentParams).then((result) => {
                        resolve(result)
                    })
                })
            })
        })
    };

    function getSegmentsViaYoutube(result, url) {
        return new Promise((resolve, reject) => {
            youtube.getYoutubeTranscript(result).then(transcript => {
                if (transcript.slice(0, 3) == 'The') {
                    console.log("You don't have the right permissions to download this file.  Reverting back to Google Speech...")
                    getSegmentsViaGoogleSpeech(url).then(result => {
                          resolve(result)
                    })
                } else {
                    var segments = youtube.parseYoutubeTranscript(transcript)
                    resolve(segments)
                }
            })
        })
    }

    ////////////////////////////////////////////////////////////////////////////
    // END USER API  ///////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    return {
        getTopicWeightsFromURL: getTopicWeightsFromURL,
    }
}

module.exports = new tubeTopics();
