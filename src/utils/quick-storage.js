// At the top of your file - NO REDIS NEEDED
const codeVerifiers = new Map();

export const storeCodeVerifier = (state, codeVerifier) => {
  codeVerifiers.set(state, {
    verifier: codeVerifier,
    timestamp: Date.now()
  });
  
  // Auto-cleanup after 10 minutes
  setTimeout(() => codeVerifiers.delete(state), 10 * 60 * 1000);
};

export const getCodeVerifier = (state) => {
  const data = codeVerifiers.get(state);
  return data?.verifier;
};

export const deleteCodeVerifier = (state) => {
  codeVerifiers.delete(state);
};