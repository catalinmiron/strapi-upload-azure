'use strict';

/**
 * Module dependencies
 */

// Public node modules.
const sharp = require('sharp');

const {
  Aborter,
  BlobURL,
  BlockBlobURL,
  ContainerURL,
  ServiceURL,
  StorageURL,
  SharedKeyCredential
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
      label: 'Set max width when uploading image',
      type: 'number'
    },
    maxHeight: {
      label: 'Set max height when uploading image',
      type: 'number'
    }
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
          if(file.mime.indexOf('image/') > -1){
            file.buffer = await sharp(file.buffer)
              .resize({
                width: 512,
                height:512,
                kernel: sharp.kernel.nearest,
                fit: 'contain',
                withoutEnlargement: true
              })
              .png()
              .toBuffer();
            file.size = (file.buffer.length / 100) + ''
            file.ext = '.png'
          }

          const blobName = `${file.hash}${file.ext}`;
          const blobURL = BlobURL.fromContainerURL(containerURL, blobName);
          const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
          file.url = config.cdnName ? blobURL.url.replace(serviceURL.url, config.cdnName) : blobURL.url;

          return blockBlobURL.upload(
            Aborter.timeout(60 * 60 * 1000),
            file.buffer,
            file.buffer.length
          )
          .then(function(){
            resolve()
          }, function(err){
            return reject(err);
          })
        });
      },
      delete: (file) => {
        return new Promise((resolve, reject) => {
          const blobName = `${file.hash}${file.ext}`;
          const blobURL = BlobURL.fromContainerURL(containerURL, blobName);
          const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);

          return blockBlobURL.delete()
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
