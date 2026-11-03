import type { CSSProperties } from 'react';

const sectionStyle: CSSProperties = { marginBottom: 16 };
const headingStyle: CSSProperties = { margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#f0f0f0' };
const textStyle: CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.5, color: '#c0c0c6' };

/** Short guide shown from Settings. Everything here happens on this phone; nothing is sent anywhere. */
export const Instructions = () => (
  <div style={{ color: '#f0f0f0' }}>
    <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>How 16 Local works</h2>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Add people</h3>
      <p style={textStyle}>
        Tap Add person to type someone in, or import from your address book. Imports only add people you
        tick, and anyone already in your graph (same phone number or name) is skipped.
      </p>
      <p style={{ ...textStyle, marginTop: 6 }}>
        If you don&apos;t know someone personally, tick &quot;I don&apos;t know them personally&quot;. They won&apos;t
        be connected to you, and you&apos;ll be asked whether to connect them to someone you know.
      </p>
    </section>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Closeness</h3>
      <p style={textStyle}>
        Each person has a closeness from 1 (distant) to 10 (inner circle), and you can enter decimals too.
        Closer people sit nearer you on the graph. Distant, Acquaintance, Friend, Close and Inner circle
        mark the usual points along the scale. New people start at Friend (5.5).
      </p>
    </section>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Links</h3>
      <p style={textStyle}>
        Open a person and choose Link to…. The background turns blue: search the list, or tap people on the
        graph to link or unlink them. Choose Done when you finish.
      </p>
    </section>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Tags and notes</h3>
      <p style={textStyle}>
        Type a tag on a person to add it. Tags are one shared list: a tag you type once can be picked for anyone.
        Keep a private note on each person, and search by name, tag, about text, or notes from the search bar.
      </p>
    </section>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Find a path</h3>
      <p style={textStyle}>
        Choose Find Path on a person to highlight the shortest chain of connections from you to them.
      </p>
    </section>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Select several people</h3>
      <p style={textStyle}>
        Choose Select, then tap people on the graph to build a group. You can then set closeness, add a tag,
        or delete the whole group at once. Choose Done selecting to go back to single people.
      </p>
    </section>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Recent and needs info</h3>
      <p style={textStyle}>
        Tap the search box with nothing typed to see the people you worked with most recently, and the
        people whose phone, about text or tags are still blank.
      </p>
    </section>

    <section>
      <h3 style={headingStyle}>Your data</h3>
      <p style={textStyle}>
        Everything is stored on this phone and nothing leaves it. Deleting the app deletes your graph, so
        keep your phone backed up.
      </p>
    </section>
  </div>
);
