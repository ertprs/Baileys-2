import {
    WAConnection,
    MessageType,
    Presence,
    MessageOptions,
    Mimetype,
    WALocationMessage,
    MessageLogLevel,
    WA_MESSAGE_STUB_TYPES,
    ReconnectMode,
} from '../src/WAConnection/WAConnection'
import * as fs from 'fs'
import mysql from 'mysql'

function getContent() {
    // https://www.indiaabroad.com/indian-americans/dreams-from-her-mother-how-shyamala-gopalan-prepared-kamala-harris-for-the-white-house/article_fffe185a-1d31-11e9-ba9b-973ade35c0fb.html
    let content = fs.readFileSync('./Media/kamala2.jpeg');
    return content;
}

function saveChatToDb(sender, receiver, content) {
    return;
    // var connection = mysql.createConnection({
    //     host     : 'localhost',
    //     user     : 'root',
    //     password : 'Asdf1234',
    //     database : 'tsb'
    // });
    var connection = mysql.createConnection({
        host     : 'aarq63ieh2u70c.cxolgjrfiats.us-west-1.rds.amazonaws.com',
        user     : 'venkateshkr',
        password : 'Asdf1234',
        database : 'tsb'
    });

    connection.connect();
    connection.query('INSERT INTO tsb.waChats SET ?', {fromPhone: sender, toPhone: receiver, content: content},
        function (error, results, fields) {
        if (error) throw error;
        console.log(results.insertId);
    });
}

function waKeyToPhoneNumber(key) {
    //TODO(venky): use https://github.com/google/libphonenumber
    return key.replace(/@.*$/,'').trim();
}

async function example() {
    const conn = new WAConnection() // instantiate
    conn.autoReconnect = ReconnectMode.onConnectionLost // only automatically reconnect when the connection breaks
    conn.logLevel = MessageLogLevel.info // set to unhandled to see what kind of stuff you can implement

    // loads the auth file credentials if present
    fs.existsSync('./auth_info.json') && conn.loadAuthInfo ('./auth_info.json')

    // connect or timeout in 60 seconds
    conn.connectOptions.timeoutMs = 60*1000
    // attempt to reconnect at most 10 times
    conn.connectOptions.maxRetries = 10
    await conn.connect()

    // const unread = await conn.loadAllUnreadMessages ()
    //
    console.log('oh hello ' + conn.user.name + ' (' + conn.user.jid + ')')
    // console.log('you have ' + conn.chats.all().length + ' chats & ' + Object.keys(conn.contacts).length + ' contacts')
    // console.log ('you have ' + unread.length + ' unread messages')
    //
    const authInfo = conn.base64EncodedAuthInfo() // get all the auth info we need to restore this session
    fs.writeFileSync('./auth_info.json', JSON.stringify(authInfo, null, '\t')) // save this info to a file

    // /*  Note: one can take this auth_info.json file and login again from any computer without having to scan the QR code,
    //     and get full access to one's WhatsApp. Despite the convenience, be careful with this file */
    // conn.on ('user-presence-update', json => console.log(json.id + ' presence is ' + json.type))
    // conn.on ('message-status-update', json => {
    //     const participant = json.participant ? ' (' + json.participant + ')' : '' // participant exists when the message is from a group
    //     console.log(`${json.to}${participant} acknlowledged message(s) ${json.ids} as ${json.type}`)
    // })
    //  // set to false to NOT relay your own sent messages
    conn.on('message-new', async (m) => {
        const messageStubType = WA_MESSAGE_STUB_TYPES[m.messageStubType] ||  'MESSAGE'
        console.log('got notification of type: ' + messageStubType)

        const messageContent = m.message
        // if it is not a regular text or media message
        if (!messageContent) return

        if (m.key.fromMe) {
            console.log('relayed my own message')
            return
        }

        let sender = m.key.remoteJid
        let senderPhoneNumber = waKeyToPhoneNumber(sender)
        let receiverPhoneNumber = waKeyToPhoneNumber(conn.user.jid);
        saveChatToDb(senderPhoneNumber, receiverPhoneNumber, m.message.conversation);
        if (m.key.participant) {
            // participant exists if the message is in a group
            sender += ' (' + m.key.participant + ')'
        }
        const messageType = Object.keys (messageContent)[0] // message will always contain one key signifying what kind of message
        if (messageType === MessageType.text) {
            const text = m.message.conversation
            console.log(sender + ' sent: ' + text)
        } else if (messageType === MessageType.extendedText) {
            const text = m.message.extendedTextMessage.text
            console.log(sender + ' sent: ' + text + ' and quoted message: ' + JSON.stringify(m.message))
        } else if (messageType === MessageType.contact) {
            const contact = m.message.contactMessage
            console.log(sender + ' sent contact (' + contact.displayName + '): ' + contact.vcard)
        } else if (messageType === MessageType.location || messageType === MessageType.liveLocation) {
            const locMessage = m.message[messageType] as WALocationMessage
            console.log(`${sender} sent location (lat: ${locMessage.degreesLatitude}, long: ${locMessage.degreesLongitude})`)

            await conn.downloadAndSaveMediaMessage(m, './Media/media_loc_thumb_in_' + m.key.id) // save location thumbnail

            if (messageType === MessageType.liveLocation) {
                console.log(`${sender} sent live location for duration: ${m.duration/60}`)
            }
        } else {
            // if it is a media (audio, image, video, sticker) message
            // decode, decrypt & save the media.
            // The extension to the is applied automatically based on the media type
            try {
                const savedFile = await conn.downloadAndSaveMediaMessage(m, './Media/media_in_' + m.key.id)
                console.log(sender + ' sent media, saved at: ' + savedFile)
            } catch (err) {
                console.log('error in decoding message: ' + err)
            }
        }
        // send a reply after 3 seconds
        setTimeout(async () => {
            // await conn.chatRead(m.key.remoteJid) // mark chat read
            // await conn.updatePresence(m.key.remoteJid, Presence.available) // tell them we're available
            // await conn.updatePresence(m.key.remoteJid, Presence.composing) // tell them we're composing

            const options: MessageOptions = { quoted: m }
            let content
            let type: MessageType
            // const rand = Math.random()
            // if (rand > 0.66) { // choose at random
            //     content = 'hello!' // send a "hello!" & quote the message recieved
            //     type = MessageType.text
            // } else if (rand > 0.33) { // choose at random
            //     content = { degreesLatitude: 32.123123, degreesLongitude: 12.12123123 }
            //     type = MessageType.location
            // } else {
            //     content = fs.readFileSync('./Media/ma_gif.mp4') // load the gif
            //     options.mimetype = Mimetype.gif
            //     type = MessageType.video
            // }
            let messageToSend = "Thanks. Please forward the message below 👇 to 5 friends, so they can do the same:";
            // let messageToSend = "Thanks. Please forward the message below to four friends so they can do the same."
            let response = await conn.sendMessage(m.key.remoteJid, messageToSend,
                MessageType.text, {})
            // const response = await conn.sendMessage(m.key.remoteJid, content, type, options)
            console.log("sent message with ID '" + response.key.id + "' successfully")

            // content = fs.readFileSync('./Media/kamala.jpeg') // load the image
            // content = getContent();
            // options.mimetype = Mimetype.png
            // type = MessageType.image
            // response = await conn.sendMessage(m.key.remoteJid, content, type, options)
            // console.log("sent message with ID '" + response.key.id + "' successfully")

            messageToSend = "Dear Friend,\n" +
                "Let's help elect Democrats in 2020.\n" +
                "To get started, please click this WhatsApp link and send the msg:\n" +
                "https://wa.me/16504592617?text=Vote%20Blue%20from%20%2B" + senderPhoneNumber + "\n" +
                "See http://LetsVote.blue for more info.";

            // messageToSend = "To help elect Democrats in 2020, please click this WhatsApp link and send the msg: " +
            //     "https://wa.me/16504592722?text=vote_blue_from_" + senderPhoneNumber + " " +
            //     "See http://letsvote.blue for more info.";
            const response2 = await conn.sendMessage(m.key.remoteJid, messageToSend,
                MessageType.text, {})
            console.log("sent message with ID '" + response2.key.id + "' successfully")
            saveChatToDb(receiverPhoneNumber, senderPhoneNumber, messageToSend);

        }, 3 * 1000)
    })

    // /* example of custom functionality for tracking battery */
    // conn.registerCallback(['action', null, 'battery'], json => {
    //     const batteryLevelStr = json[2][0][1].value
    //     const batterylevel = parseInt(batteryLevelStr)
    //     console.log('battery level: ' + batterylevel)
    // })
    // conn.on('close', ({reason, isReconnecting}) => (
    //     console.log ('oh no got disconnected: ' + reason + ', reconnecting: ' + isReconnecting)
    // ))
}

example().catch((err) => console.log(`encountered error: ${err}`))
