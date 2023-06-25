"use strict";

const StorageBase = require("ghost-storage-base"),
  errors = require("@tryghost/errors"),
  fetch = require("node-fetch"),
  FormData = require('form-data'),
  fs = require('fs');

const CLOUDFLARE_IMAGES_API_BASE_URL = "https://api.cloudflare.com/client/v4";

class CloudflareImagesStorageAdapter extends StorageBase {
  /**
   *  @override
   */
  constructor(options) {
    super(options);
    this.options = options;
    this.imagesApiBaseUrl = `${CLOUDFLARE_IMAGES_API_BASE_URL}/accounts/${this.options.accountId}/images/v1`;
    this.imagesApiBaseHeaders = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.options.authToken}`
    };
  }

  /**
   *  @override
   */
  async exists(filename) {
    console.log("exists:filename:", filename);
    const imageApiUrlWithId = `${this.imagesApiBaseUrl}/${this.options.idPrefix}${filename}`;
    try {
      const response = await fetch(imageApiUrlWithId, {
        method: 'GET',
        headers: this.imagesApiBaseHeaders,
      });
      if (response.status === 404) {
        return false;
      } else if (!response.ok) {
        throw new Error(`Cloudflare image exists check failed. Message: HTTP ${response.status} ${response.statusText}`);
      } else {
        return true;
      }
    }
    catch (error) {
      console.log("exists:error:", error);
      return new errors.InternalServerError({
        err: error,
        message: `Could not check if image exists: ${filename}. API URL: ${imageApiUrlWithId}`,
      });
    }
  }

  /**
   *  @override
   */
  async save(image) {
    const fileName = this.getSanitizedFileName(image.name);
    const imageId = `${this.options.idPrefix}${fileName}`;
    
    const formData = new FormData();
    formData.append('id', imageId);
    formData.append('file', fs.createReadStream(image.path))
    console.log("save:id:", imageId);

    try {
      let imageExists = await this.exists(fileName);
      console.log("save:imageAlreadyExists:", imageExists);

      if (imageExists && this.options.overwrite) {
        await this.delete(fileName);
        imageExists = false;
      }

      if (!imageExists) {
        const response = await fetch(this.imagesApiBaseUrl, {
          method: 'POST',
          headers: this.imagesApiBaseHeaders,
          body: formData
        });
        if (!response.ok) {
          throw new Error(`Cloudflare image upload failed. Message: HTTP ${response.status} ${response.statusText} ${response}`);
        }
        const result = await response.json();
        if (!result.success) {
          throw new Error(`Cloudflare image upload failed. Message: ${result.errors?.join(' ')}`);
        } else {
          const imageUrl = `${this.options.cdnBaseUrl}/${this.options.variant}/${result.result.id}`;
          console.log("save:imageUrl:", imageUrl);
          return imageUrl;
        }
      } else {
        const imageUrl = `${this.options.cdnBaseUrl}/${this.options.variant}/${imageId}`;
        console.log("save:imageUrl (already existed, not overwritten):", imageUrl);
        return imageUrl;
      }
    }
    catch (error) {
      console.log("save:error:", error);
      return new errors.InternalServerError({
        err: error,
        message: `Cloudflare image upload failed. Path: ${image.path}`,
      });
    }
  }

  /**
   *  @override
   */
  serve() {
    return (req, res, next) => {
      next();
    };
  }

  /**
   *  @override
   */
  async delete(filename) {
    console.log("delete:filename:", filename);
    const imageApiUrlWithId = `${this.imagesApiBaseUrl}/${this.options.idPrefix}${filename}`;
    try {
      const response = await fetch(imageApiUrlWithId, {
        method: 'DELETE',
        headers: this.imagesApiBaseHeaders,
      });
      if (!response.ok) {
        throw new Error(`Cloudflare image delete failed. Message: HTTP ${response.status} ${response.statusText}`);
      }
    }
    catch (error) {
      console.log("delete:error:", error);
      return new errors.InternalServerError({
        err: error,
        message: `Could not delete image: ${filename}. API URL: ${imageApiUrlWithId}`,
      });
    }
  }

  /**
   *  @override
   */
  async read(options) {
    // NOT IMPLEMENTED
  }
}

module.exports = CloudflareImagesStorageAdapter;
