"use client";

import axios from "axios";
import { useEffect, useState } from "react";

export default function Home() {
  const [stream, setStream] = useState("");

  useEffect(() => {
    async function fetchStream() {
      const response = await axios.get(process.env.STREAM_API + "/stream");
      setStream(response.data);
    }
    fetchStream();
  }, []);

  return <div>{stream}</div>;
}
