var fs = require('fs');
var tubeTopics = require('../index.js');

tubeTopics.getTopicWeightsFromURL('https://www.youtube.com/watch?v=OVTu4XcmnwE').then(function(result){
  var jsonData = JSON.stringify(result);
  fs.writeFile("compiler.txt", jsonData, function(err) {
    if(err) {
        return console.log(err);
    }
});
})

// tubeTopics.getAudioSegmentParams('/Applications/packages/tubeTopics/sound.mp4').then((segments)=>{
//   console.log(segments)
// })

// https://www.youtube.com/watch?v=Xt5dRmr8bCw
// https://www.youtube.com/watch?v=kpCJyQ2usJ4&list=PL1847B1B2268562C7
