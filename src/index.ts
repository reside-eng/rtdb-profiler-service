// Imports the Google Cloud client library
import { PubSub } from '@google-cloud/pubsub';
import { profileAndUpload } from './profilerService';

const subscriptionName = 'profiler-sub';
// const timeout = 60;

// Imports the Google Cloud client library

// Creates a client; cache this for further use
const pubSubClient = new PubSub({
  projectId: process.env.GCP_PROJECT,
});

/**
 *
 */
function listenForMessages(): any {
  console.log('Started listing for messages');
  // References an existing subscription
  const subscription = pubSubClient.subscription(subscriptionName);

  // Create an event handler to handle messages
  // let messageCount = 0;
  const messageHandler = async (message: any): Promise<any> => {
    console.log(`Received message ${message.id}:`);
    console.log(`\tData: ${message.data}`);
    console.log(`\tAttributes: ${message.attributes}`);
    // messageCount += 1;

    // "Ack" (acknowledge receipt of) the message
    message.ack();
    await profileAndUpload();
  };

  // Listen for new messages until timeout is hit
  subscription.on('message', messageHandler);

  // setTimeout(() => {
  //   subscription.removeListener('message', messageHandler);
  //   console.log(`${messageCount} message(s) received.`);
  //   listenForMessages()
  // }, timeout * 1000);
}

listenForMessages();
