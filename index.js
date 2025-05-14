const express = require('express');
const { exec } = require('child_process');
const app = express();
const PORT = 3001;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Deployment Server Running');
});

app.post('/deployserver', (req, res) => {
  const { digest, name, bot, chatid } = req.body;

  const CONTAINER_NAME = name;
  const FULL_IMAGE = digest;
  const TELEGRAM_API = `https://api.telegram.org/${bot}/sendMessage`;
  const CHAT_ID = chatid;

  // Cleanup commands
  const cleanupCommand = `
    echo "Cleaning up old Docker images...";
    docker image prune -a -f;

    echo "Cleaning up stopped containers...";
    docker container prune -f;

    echo "Cleaning up unused volumes...";
    docker volume prune -f;

    echo "Cleaning up build cache...";
    docker builder prune -f;
  `;

  // Combine cleanup and deployment commands
  const shellCommand = `

    echo "Pulling image ${FULL_IMAGE}...";
    docker pull ${FULL_IMAGE} || exit 1;

    echo "Stopping and removing old container (if exists)...";
    docker stop ${CONTAINER_NAME} 2>/dev/null || true;
    docker rm ${CONTAINER_NAME} 2>/dev/null || true;

    echo "Running new container from ${FULL_IMAGE}...";
    docker run -d -p 32768:8899 --name ${CONTAINER_NAME} ${FULL_IMAGE} || exit 1;

    echo "Sending Telegram success message...";
    curl -s -X POST "${TELEGRAM_API}" -d chat_id=${CHAT_ID} -d text="Code Deployed To ${CONTAINER_NAME}";

    ${cleanupCommand}
  `;

  exec(shellCommand, (error, stdout, stderr) => {
    if (error) {
      console.error("Deployment error:", stderr);
      const errorMessage = `❌ Deployment failed for container ${CONTAINER_NAME}.\nError: ${stderr}`;
      sendTelegramMessage(errorMessage);
      return res.status(500).send(`❌ Deployment failed:\n${stderr}`);
    }

    const successMessage = `Deployment successful for container ${CONTAINER_NAME}`;
    sendTelegramMessage(successMessage);

    res.send(`✅ Deployment successful:\n${stdout}`);
  });

  // Function to send a message to Telegram
  function sendTelegramMessage(message) {
    const url = `${TELEGRAM_API}?chat_id=${CHAT_ID}&text=${encodeURIComponent(message)}`;
    exec(`curl -s "${url}"`, (err, stdout, stderr) => {
      if (err) {
        console.error("Failed to send message to Telegram:", stderr);
      }
    });
  }
});

app.post('/deployserver_test', (req, res) => {
  const { digest, name, bot, chatid } = req.body;

  const CONTAINER_NAME = name;
  const FULL_IMAGE = digest;
  const TELEGRAM_API = `https://api.telegram.org/${bot}/sendMessage`;
  const CHAT_ID = chatid;

  // Cleanup commands
  const cleanupCommand = `
    echo "Cleaning up old Docker images...";
    docker image prune -a -f;

    echo "Cleaning up stopped containers...";
    docker container prune -f;

    echo "Cleaning up unused volumes...";
    docker volume prune -f;

    echo "Cleaning up build cache...";
    docker builder prune -f;
  `;

  // Combine cleanup and deployment commands
  const shellCommand = `

    echo "Pulling image ${FULL_IMAGE}...";
    docker pull ${FULL_IMAGE} || exit 1;

    echo "Stopping and removing old container (if exists)...";
    docker stop ${CONTAINER_NAME} 2>/dev/null || true;
    docker rm ${CONTAINER_NAME} 2>/dev/null || true;

    echo "Running new container from ${FULL_IMAGE}...";
    docker run -d -p 32769:8899 --name ${CONTAINER_NAME} ${FULL_IMAGE} || exit 1;

    echo "Sending Telegram success message...";
    curl -s -X POST "${TELEGRAM_API}" -d chat_id=${CHAT_ID} -d text="Code Deployed To ${CONTAINER_NAME}";

    ${cleanupCommand}
  `;

  exec(shellCommand, (error, stdout, stderr) => {
    if (error) {
      console.error("Deployment error:", stderr);
      const errorMessage = `❌ Deployment failed for container ${CONTAINER_NAME}.\nError: ${stderr}`;
      sendTelegramMessage(errorMessage);
      return res.status(500).send(`❌ Deployment failed:\n${stderr}`);
    }

    const successMessage = `Deployment successful for container ${CONTAINER_NAME}`;
    sendTelegramMessage(successMessage);

    res.send(`✅ Deployment successful:\n${stdout}`);
  });

  // Function to send a message to Telegram
  function sendTelegramMessage(message) {
    const url = `${TELEGRAM_API}?chat_id=${CHAT_ID}&text=${encodeURIComponent(message)}`;
    exec(`curl -s "${url}"`, (err, stdout, stderr) => {
      if (err) {
        console.error("Failed to send message to Telegram:", stderr);
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`Webhook listener running on port ${PORT}`);
});
