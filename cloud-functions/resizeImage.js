/********************************************************************************************************
 * This code will not work locally. You need deploy this code to Google Cloud Functions for it to work. *
 ********************************************************************************************************/

// Image files can be quite large and hence, must be sent over multiple packets as a multipart/form-data request.
// The 'busboy' library is used for parsing multipart/form-data requests as Node.js does not have this feature built-in.
const path = require('path');
const os = require('os');
const fs = require('fs');
const Busboy = require('busboy');
const sharp = require('sharp');

exports.resizeImage = (req, res) => {
  // This is needed to allow the endpoint to be called from other origins (domains) other than cloudfunctions.net (Google's domain for GCF).
  // For more information about CORS policies/security: https://en.wikipedia.org/wiki/Cross-origin_resource_sharing
  res.set('Access-Control-Allow-Origin', '*');

  // Only allow this function to be called with the POST request method.
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const busboy = new Busboy({ headers: req.headers });
  let newDimensions = { // Default dimensions of output image if not specified.
    newWidth: 100,
    newHeight: 100
  };

  let filePromise;
  let imageFilepath;
  let imageMimeType;

  // This segment will process each field uploaded.
  busboy.on('field', function (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
    // Validate names of provided fields.
    if (!Object.keys(newDimensions).includes(fieldname)) {
      res.status(400).json({
        "error": `Invalid field specified. Valid field values are ${Object.keys(newDimensions).toString()}.`,
        "received": fieldname
      });
      return;
    }

    newDimensions[fieldname] = parseInt(val);
  });

  // This segment will process each file uploaded.
  busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
    // Validate that only one file has been sent in the request.
    // As image MIME type would be undefined if we have not processed the file, validate by checking if MIME type has a value.
    if (imageMimeType) {
      res.status(400).json({
        "error": `Only one file can be specified at a single time.`
      });
      return;
    }

    // Ignore files which are not images.
    if (!mimetype.includes("image")) {
      res.status(415).json({
        "error": `The uploaded file "${filename}" is not an image.`,
        "received": mimetype
      });
      return;
    }

    imageMimeType = mimetype;

    // The image data will gradually come in multiple parts, so we write to a new file using a stream.
    // The file is saved into the function execution instance's in-memory file system.
    // There is a hard limit of 10MB on the capacity of the in-memory file system, per execution.
    imageFilepath = path.join(os.tmpdir(), filename);
    const writeStream = fs.createWriteStream(imageFilepath);
    file.pipe(writeStream);

    // File creation is asynchronous.
    // Return a Promise so we can wait for the new file to be fully saved to disk.
    filePromise = new Promise((resolve, reject) => {
      file.on('end', () => {
        writeStream.end();
      });
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  });

  // This segment is executed when the file and all fields have been processed.
  // Image resizing is only started when the image has been fully saved to disk.
  busboy.on('finish', () => {
    filePromise
      .then(() => {
        return sharp(imageFilepath)
          .resize(newDimensions.newWidth, newDimensions.newHeight)
          .toBuffer();
      })
      .then((dataBuffer) => {
        res.set({ 'Content-Type': imageMimeType });
        res.status(200).send(dataBuffer);
      })
      .catch(err => {
        res.status(500).send({
          "error": err.message
        });
      });
  });

  busboy.end(req.rawBody);
};
