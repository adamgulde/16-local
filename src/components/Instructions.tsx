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
    </section>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Closeness</h3>
      <p style={textStyle}>
        Each person has a closeness from 1 (distant) to 5 (inner circle). Closer people sit nearer you on
        the graph. New people start at 3.
      </p>
    </section>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Links</h3>
      <p style={textStyle}>
        Open a person and choose Link to… to connect two of your contacts who know each other.
      </p>
    </section>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Tags and notes</h3>
      <p style={textStyle}>
        Tag people from the curated list or write your own tags, and keep a private note on each person.
        Search by name, tag, about text, or notes from the search bar.
      </p>
    </section>

    <section style={sectionStyle}>
      <h3 style={headingStyle}>Find a path</h3>
      <p style={textStyle}>
        Choose Find Path on a person to highlight the shortest chain of connections from you to them.
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
