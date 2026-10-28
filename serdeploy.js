
const express = require('express');
const { execFile } = require('child_process');

const app = express();
const PORT = 3001;

app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.send('Deployment Server Running');
});

// Execute Docker commands without shell interpolation
function runDocker(args) {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      args,
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message).trim()));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

// Send Telegram notification
function sendTelegramMessage(bot, chatid, message) {
  if (!bot || !chatid) return;

  const url = `https://api.telegram.org/${bot}/sendMessage`;

  execFile(
    'curl',
    [
      '-sS',
      '--max-time', '10',
      '-X', 'POST',
      url,
      '-d', `chat_id=${chatid}`,
      '-d', `text=${message}`
    ],
    (error, stdout, stderr) => {
      if (error) {
        console.error(
          'Telegram notification failed:',
          stderr || error.message
        );
      }
    }
  );
}

app.post('/deployserver/:mainport/:port', async (req, res) => {
  const { digest, name, bot, chatid } = req.body;
  const { mainport, port } = req.params;

  // Validate required inputs
  if (!digest || !name || !mainport || !port) {
    return res.status(400).send(
      'Missing required fields: digest, name, mainport, or port'
    );
  }

  // Validate container name
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
    return res.status(400).send('Invalid container name');
  }

  // Validate ports
  if (
    !/^\d+$/.test(mainport) ||
    !/^\d+$/.test(port) ||
    Number(mainport) < 1 ||
    Number(mainport) > 65535 ||
    Number(port) < 1 ||
    Number(port) > 65535
  ) {
    return res.status(400).send('Invalid port');
  }

  // Basic image-reference validation
  if (
    typeof digest !== 'string' ||
    digest.length > 512 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(digest)
  ) {
    return res.status(400).send('Invalid Docker image reference');
  }

  const CONTAINER_NAME = name;
  const FULL_IMAGE = digest;

  console.log('Deployment request:', {
    image: FULL_IMAGE,
    container: CONTAINER_NAME,
    mainport,
    port
  });

  // Check whether a container with this exact name exists
  async function containerExists(containerName) {
    const output = await runDocker([
      'ps',
      '-a',
      '--filter',
      `name=^/${containerName}$`,
      '--format',
      '{{.Names}}'
    ]);

    return output.split('\n').includes(containerName);
  }

  try {
    // 1. Pull the new image before touching the existing container
    console.log(`Pulling image ${FULL_IMAGE}...`);

    await runDocker(['pull', FULL_IMAGE]);

    console.log('Image pulled successfully.');

    // 2. Stop and remove only the old container with this exact name
    if (await containerExists(CONTAINER_NAME)) {
      console.log(`Stopping old container ${CONTAINER_NAME}...`);

      const running = await runDocker([
        'ps',
        '--filter',
        `name=^/${CONTAINER_NAME}$`,
        '--format',
        '{{.Names}}'
      ]);

      if (running.split('\n').includes(CONTAINER_NAME)) {
        await runDocker(['stop', CONTAINER_NAME]);
        console.log('Old container stopped.');
      }

      // Delete only this container, not other containers
      await runDocker(['rm', CONTAINER_NAME]);

      console.log(`Old container ${CONTAINER_NAME} removed.`);
    } else {
      console.log('No existing container found.');
    }

    // 3. Create and start the new container
    console.log(`Starting new container ${CONTAINER_NAME}...`);

    const containerId = await runDocker([
      'run',
      '-d',
      '--restart',
      'unless-stopped',
      '-p',
      `${mainport}:${port}`,
      '--name',
      CONTAINER_NAME,
      FULL_IMAGE
    ]);

    console.log('New container started:', containerId);

    // 4. Send success notification
    const successMessage =
      `✅ Deployment successful for ${CONTAINER_NAME}`;

    sendTelegramMessage(bot, chatid, successMessage);

    return res.status(200).send(
      `${successMessage}\nContainer ID: ${containerId}`
    );

  } catch (error) {
    console.error('Deployment error:', error.message);

    const errorMessage =
      `❌ Deployment failed for ${CONTAINER_NAME}.\nError: ${error.message}`;

    sendTelegramMessage(bot, chatid, errorMessage);

    return res.status(500).send(errorMessage);
  }
});

app.listen(PORT, () => {
  console.log(`Deployment webhook listening on port ${PORT}`);
});
