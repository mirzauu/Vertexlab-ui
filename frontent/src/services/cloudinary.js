import { api } from './api';

/**
 * Request signed upload credentials from the FastAPI backend.
 */
export async function getUploadSignature(orgId, taskId, fileName, fileType) {
  const res = await api(`/api/v1/organizations/${orgId}/tasks/${taskId}/upload-signature`, {
    method: 'POST',
    body: JSON.stringify({
      file_name: fileName,
      file_type: fileType, // 'audio' or 'raw_data'
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to obtain upload signature: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Upload a file directly to Cloudinary using XMLHttpRequest for granular progress tracking.
 */
export function uploadDirectToCloudinary(file, signatureData, onProgress) {
  return new Promise((resolve, reject) => {
    const { signature, timestamp, api_key, cloud_name, folder, resource_type } = signatureData;

    const url = `https://api.cloudinary.com/v1_1/${cloud_name}/${resource_type}/upload`;
    const formData = new FormData();

    formData.append('file', file);
    formData.append('api_key', api_key);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', folder);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (err) {
          reject(new Error('Failed to parse Cloudinary response'));
        }
      } else {
        let errMessage = `Cloudinary upload failed with status ${xhr.status}`;
        try {
          const errRes = JSON.parse(xhr.responseText);
          if (errRes.error && errRes.error.message) {
            errMessage = errRes.error.message;
          }
        } catch (e) {
          // ignore
        }
        reject(new Error(errMessage));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred during Cloudinary upload'));
    };

    xhr.send(formData);
  });
}

/**
 * Register an uploaded audio file with the backend.
 */
export async function registerCloudinaryAudio(orgId, taskId, { publicId, secureUrl, fileName, fileSize, mimeType }) {
  const res = await api(`/api/v1/organizations/${orgId}/tasks/${taskId}/files/register`, {
    method: 'POST',
    body: JSON.stringify({
      cloudinary_public_id: publicId,
      cloudinary_url: secureUrl,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType || 'audio/mpeg',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to register audio file: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Register an uploaded document file with the backend.
 */
export async function registerCloudinaryDocument(orgId, taskId, { publicId, secureUrl, fileName, fileSize, mimeType, examStartPage }) {
  let examPageNum = null;
  if (examStartPage !== undefined && examStartPage !== null && String(examStartPage).trim() !== '') {
    const parsed = parseInt(examStartPage, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      examPageNum = parsed;
    }
  }

  const res = await api(`/api/v1/organizations/${orgId}/tasks/${taskId}/documents/register`, {
    method: 'POST',
    body: JSON.stringify({
      cloudinary_public_id: publicId,
      cloudinary_url: secureUrl,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType || 'application/pdf',
      examination_start_page: examPageNum,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to register document: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Full workflow: Signature -> Cloudinary Direct Upload -> Backend Registration.
 */
export async function uploadDirectAndRegister({
  file,
  fileType, // 'audio' or 'raw_data'
  orgId,
  taskId,
  examStartPage,
  onProgress,
}) {
  // 1. Get Signature
  const signatureData = await getUploadSignature(orgId, taskId, file.name, fileType);

  // 2. Direct Upload to Cloudinary
  const uploadResult = await uploadDirectToCloudinary(file, signatureData, onProgress);

  // 3. Register with Backend
  if (fileType === 'audio') {
    return await registerCloudinaryAudio(orgId, taskId, {
      publicId: uploadResult.public_id,
      secureUrl: uploadResult.secure_url,
      fileName: file.name,
      fileSize: uploadResult.bytes || file.size,
      mimeType: file.type || 'audio/mpeg',
    });
  } else {
    return await registerCloudinaryDocument(orgId, taskId, {
      publicId: uploadResult.public_id,
      secureUrl: uploadResult.secure_url,
      fileName: file.name,
      fileSize: uploadResult.bytes || file.size,
      mimeType: file.type || 'application/pdf',
      examStartPage,
    });
  }
}
