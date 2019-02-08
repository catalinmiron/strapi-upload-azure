'use strict';

/**
 * Module dependencies
 */

// Public node modules.
const BufferStream = require('./BufferStream');
const jimp = require('jimp');

const {
  Aborter,
  BlobURL,
  BlockBlobURL,
  ContainerURL,
  ServiceURL,
  StorageURL,
  SharedKeyCredential,
  uploadStreamToBlockBlob
} = require("@azure/storage-blob");

/* eslint-disable no-unused-vars */
module.exports = {
  provider: 'azure',
  name: 'Azure Storage Service',
  auth: {
    account: {
      label: 'Account name',
      type: 'text'
    },
    accountKey: {
      label: 'Secret Access Key',
      type: 'text'
    },
    containerName: {
      label: 'The name of the blob container',
      type: 'text'
    },
    cdnName: {
      label: 'Write down the host of the CDN (if you use any)',
      type: 'text'
    },
    maxWidth: {
      label: 'Thumb max width if uploading image',
      type: 'number'
    },
    maxConcurent: {
      label: 'The maximum concurent uploads to Azure',
      type: 'number'
    },
  },
  init: (config) => {
    const sharedKeyCredential = new SharedKeyCredential(config.account, config.accountKey);
    const pipeline = StorageURL.newPipeline(sharedKeyCredential);
    const serviceURL = new ServiceURL(
      `https://${config.account}.blob.core.windows.net`,
      pipeline
    );
    const containerURL = ContainerURL.fromServiceURL(serviceURL, config.containerName);

    return {
      upload: (file) => {
        return new Promise((resolve, reject) => {
          function process(file, thumbFileName){
            var blobName = `${file.hash}${file.ext}`;
            var blobURL = BlobURL.fromContainerURL(containerURL, blobName);
            var blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
            file.url = config.cdnName ? blobURL.url.replace(serviceURL.url + '/', config.cdnName) : blobURL.url;
            
            // blockBlobURL.setHTTPHeaders('Content-Type', file.mime)
            
            return uploadStreamToBlockBlob(
              Aborter.timeout(60 * 60 * 1000),
              new BufferStream(file.buffer),
              blockBlobURL,
              4 * 1024 * 1024, // 4MB block size
              ~~(config.maxConcurent) || 20, // 20 concurrency
              {
                blobHTTPHeaders: {
                  blobContentType: file.mime
                }
              }
            )
            .then(function(){
              resolve()
            }, function(err){
              return reject(err);
            })
          }
          if([jimp.MIME_PNG, jimp.MIME_JPEG, jimp.MIME_BMP].indexOf(file.mime) > -1){
            return process(file)
            .then(function(){
              return jimp.read(file.buffer)
              .then(function(image){
                return image.resize(~~(config).maxWidth || 48, jimp.AUTO) // resize
                .quality(80)
                .getBufferAsync(file.mime)
                .then(function(_buffer){
                  file = Object.assign({}, file);
                  file.url = file.url.replace(file.hash, 'thumb-' + file.hash);
                  file.hash = 'thumb-' + file.hash;
                  file.buffer = _buffer;
                  file.size = (_buffer.length / 1000) + '';
                  return process(file);
                })
              })
            })
          }
          return process(file);          
        });
      },
      delete: (file) => {
        return new Promise((resolve, reject) => {
          var blobName = `${file.hash}${file.ext}`;
          var blobURL = BlobURL.fromContainerURL(containerURL, blobName);
          var blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);

          return blockBlobURL.delete()
          .then(function(){
            if([jimp.MIME_PNG, jimp.MIME_JPEG, jimp.MIME_BMP].indexOf(file.mime) > -1){
              blobName = `thumb-${file.hash}${file.ext}`;
              blobURL = BlobURL.fromContainerURL(containerURL, blobName);
              blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
              return blockBlobURL.delete();
            }
          })
          .then(function(){
            resolve()
          }, function(err){
            return reject(err);
          })
        });
      }
    };
  }
};
