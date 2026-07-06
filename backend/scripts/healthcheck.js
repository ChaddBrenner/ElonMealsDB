const port = process.env.API_PORT || 9000;

fetch(`http://127.0.0.1:${port}/api/health`)
  .then((response) => {
    if (!response.ok) {
      process.exit(1);
    }
  })
  .catch(() => process.exit(1));
