import ActionCable from "actioncable-nodejs/src/actioncable.js";

// TODO: I'm going to crash the server if I ever get a second world message
//       at this early stage of development because I really want tok now if that
//       ever happens. This can be a console log later
let hasSeenWorldDataWithoutReconnect = false;
export function connect(APP_ID, APP_SECRET, emitter) {
  const uri = `wss://recurse.rctogether.com/cable?app_id=${APP_ID}&app_secret=${APP_SECRET}`;

  let cable = new ActionCable(uri, {
    origin: "https://example.rctogether.com",
  });

  function reconnect() {
    hasSeenWorldDataWithoutReconnect = false;
    connect(APP_ID, APP_SECRET, emitter);
  }

  return cable.subscribe("ApiChannel", {
    connected() {
      console.log("Connected to ActionCable RC Together Streaming API");
    },

    disconnected() {
      // TODO Implement reconnection and simply let the user know the data's out of date
      console.error("ActionCable RC Together API stream disconnected");
      console.error("Scheduling reconnect in 10 seconds");
      setTimeout(reconnect, 10 * 1000);
    },

    rejected() {
      console.error("ActionCable RC Together API stream disconnected");
      console.error("Scheduling reconnect in 10 seconds");
      setTimeout(reconnect, 10 * 1000);
    },

    received({ type, payload }) {
      try {
        if (type === "world") {
          emitter.emit("participant-room-data-reset");
          // Parse the initial dump of world data
          if (hasSeenWorldDataWithoutReconnect)
            // This is just a bit confusing but not that problematic
            console.error("Saw world data twice without a reconnect");
          hasSeenWorldDataWithoutReconnect = true;
          payload.entities.forEach((entity) => {
            const { type, name, zoom_user_display_name } = entity;
            if (type === "Bot" && name?.match(/rcverse/i)) {
              console.error(`Uncleaned bot found: ${entity.id}`, entity);
            } else if (type === "Note") {
              const { id, note_text, note_updated_at } = entity;
              emitter.emit("room-note-data", {
                id: String(id),
                content: note_text,
                updatedTimestamp: note_updated_at,
              });
            } else if (type === "Avatar" && zoom_user_display_name !== null) {
              const {
                person_name,
                image_path,
                last_seen_at,
                rc_hub_visit_today,
                flair,
              } = entity;

              const lastSeenMillis = new Date(last_seen_at).getTime();
              const millisSinceLastSeen = Date.now() - lastSeenMillis;
              const hourInMillis = 1000 * 60 * 60;
              // If we haven't been seen in one hour and 15 minutes
              // TODO: Contact James Porter to attempt to fix the bug where people
              //       remain in the zoom room forever
              // NOTE: For groups like Music Consumption Group, that hang in Zoom
              //       for many many hours, we DO want the long "since last seen"
              //       but for the bug where people stay in the channel forever, we don't
              //       Tricky tricky.
              if (millisSinceLastSeen > 5 * hourInMillis) return;

              emitter.emit("participant-room-data", {
                participantName: person_name,
                roomName: zoom_user_display_name,
                faceMarkerImagePath: image_path,
                inTheHub: rc_hub_visit_today,
                lastBatch: flair,
              });
            } else if (
              type === "UnknownAvatar" &&
              zoom_user_display_name !== null
            ) {
              const { person_name, image_path } = entity;

              emitter.emit("participant-room-data", {
                participantName: person_name,
                roomName: zoom_user_display_name,
                faceMarkerImagePath: image_path,
                inTheHub: false,
                lastBatch: "",
              });
            }
          });
        } else if (type === "entity") {
          const { type } = payload;
          if (type === "Note") {
            const { id, note_text, note_updated_at } = payload;
            emitter.emit("room-note-data", {
              id: String(id),
              content: note_text,
              updatedTimestamp: note_updated_at,
            });
          } else if (type === "Avatar") {
            const {
              person_name,
              zoom_user_display_name,
              image_path,
              rc_hub_visit_today,
              flair,
            } = payload;
            emitter.emit("participant-room-data", {
              participantName: person_name,
              roomName: zoom_user_display_name,
              faceMarkerImagePath: image_path,
              inTheHub: rc_hub_visit_today,
              lastBatch: flair,
            });
          } else if (type === "UnknownAvatar") {
            const { person_name, image_path, zoom_user_display_name } = payload;

            emitter.emit("participant-room-data", {
              participantName: person_name,
              roomName: zoom_user_display_name,
              faceMarkerImagePath: image_path,
              inTheHub: false,
              lastBatch: "",
            });
          }
        }
      } catch (error) {
        console.error("ActionCable couldn't handle an error:", error);
      }
    },
  });
}
