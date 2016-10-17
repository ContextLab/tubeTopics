var fs = require('fs');
var tubeTopics = require('../index.js');

tubeTopics.getTopicWeightsFromURL('https://www.youtube.com/watch?v=52ZlXsFJULI').then(function(result) {
    console.log(result)
    var jsonData = JSON.stringify(result);
    fs.writeFile("topicModel.txt", jsonData, function(err) {
        if (err) {
            return console.log(err);
        }
    })
});
