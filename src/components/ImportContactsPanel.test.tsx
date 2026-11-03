import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImportContactsPanel } from './ImportContactsPanel';
import type { GraphNode } from '../services/graphService';

const existingSam: GraphNode = {
  id: 'sam',
  kind: 'PLACEHOLDER',
  firstName: 'Sam',
  lastName: 'Smith',
  about: '',
  phoneNumber: '+1 555-000-0001',
  tags: [],
  note: '',
  strength: 3 as const,
  knownPersonally: true,
  editable: true,
};

const vcf = [
  'BEGIN:VCARD', 'FN:Samuel Smith', 'TEL;TYPE=CELL:5550000001', 'END:VCARD',
  'BEGIN:VCARD', 'N:Lovelace;Ada;;;', 'TEL:555-000-0002', 'END:VCARD',
  'BEGIN:VCARD', 'N:Turing;Alan;;;', 'END:VCARD',
].join('\n');

describe('ImportContactsPanel', () => {
  it('imports only the ticked people from an uploaded vCard, never ones already in the graph', async () => {
    const onImport = vi.fn().mockResolvedValue({ created: [{}], skippedDuplicates: 0, skippedInvalid: 0 });
    const onDone = vi.fn();
    render(<ImportContactsPanel nodes={[existingSam]} onImport={onImport} onBack={vi.fn()} onDone={onDone} />);

    const file = new File([vcf], 'contacts.vcf', { type: 'text/vcard' });
    fireEvent.change(screen.getByLabelText('Contacts file'), { target: { files: [file] } });

    await screen.findByText('Ada Lovelace');
    // Same phone as an existing contact -> shown, but locked as already added.
    expect(screen.getByText('Already in your graph')).toBeTruthy();
    // Nothing is ticked by default for a whole address book.
    expect((screen.getByRole('button', { name: /Import 0 people/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/Ada Lovelace/));
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 person' }));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][0]).toEqual([{ firstName: 'Ada', lastName: 'Lovelace', phoneNumber: '555-000-0002', about: undefined }]);
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('select all skips already-added people', async () => {
    const onImport = vi.fn().mockResolvedValue({ created: [], skippedDuplicates: 0, skippedInvalid: 0 });
    render(<ImportContactsPanel nodes={[existingSam]} onImport={onImport} onBack={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Contacts file'), {
      target: { files: [new File([vcf], 'contacts.vcf')] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 people' }));
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(onImport.mock.calls[0][0].map((e: { firstName: string }) => e.firstName)).toEqual(['Ada', 'Alan']);
  });
});
