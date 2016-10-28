var fs = require('fs');
var tubeTopics = require('../index.js');
var async = require('async')

// var videos = require('../data/khanData.json')
// var videos = videos.filter(video=>{
//   return video.parents.split('/').indexOf('World history')>0
// })

var videos = require('../data/khanData.json')
var video = videos.filter(video=>{
  return video.youtube_id=='Z_P5rqxeBVA'
})

getTopic(video)

function getTopics(videos) {
    var limitConcurrent = 20
    async.mapLimit(videos, limitConcurrent, getTopic, function(err, results) {
        // After all transcripts have been returned, process them
        console.log(results)
        if (err)
            callback(err);
        var jsonData = JSON.stringify(results);
        fs.writeFile("results.topics", jsonData, function(err) {
            if (err) {
                console.log(err)
            }
        })
    })
};

function getTopic(video,callback){
  tubeTopics.getTopicWeightsFromURL('https://www.youtube.com/watch?v=' + video.youtube_id).then(function(result) {
      console.log(result)
      var results = {metadata: video, data: result}
      var jsonData = JSON.stringify(results);
      fs.writeFile("tinypedia." + video.youtube_id + ".topics", jsonData, function(err) {
          if (err) {
              callback(null)
          }
          callback(null)
      })
  })
}
