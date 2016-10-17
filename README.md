# tubeTopics
Creates a topic model time course [using Latent Dirichlet Allocation (LDA)] from a YouTube video by analyzing the transcripts by downloading them using the Youtube API, or transcribing audio track with Google Speech API.

**Note: Requires a Youtube and Google API Key to use.**

## To set up google APIs

First, set up a Google Cloud ![account](https://cloud.google.com/)

Next, create a new project and within the project, enable the Youtube API and the Google Speech API. Create a JSON key for the project and download it.

Then, edit your `~/.bash_profile` by adding the following lines:
```
export GCLOUD_PROJECT=your-project-name
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/apikey-XXXXXXXXXXX.json
```

## To use
1. open a new terminal window
2. `git clone https://github.com/ContextLab/tubeTopics.git`
3. `npm install`
4. `node example/examples.js`
