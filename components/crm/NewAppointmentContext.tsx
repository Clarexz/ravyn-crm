"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface NewAppointmentContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const NewAppointmentContext = createContext<NewAppointmentContextValue>({
  open: false,
  setOpen: () => {},
});

export function NewAppointmentProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <NewAppointmentContext.Provider value={{ open, setOpen }}>
      {children}
    </NewAppointmentContext.Provider>
  );
}

export const useNewAppointment = () => useContext(NewAppointmentContext);
