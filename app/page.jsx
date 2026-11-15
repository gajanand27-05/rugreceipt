import CheckForm from "./CheckForm.jsx";

export default function Home() {
  return (
    <>
      <h1>Check a token before you list it or buy it</h1>
      <p>Our agent buys 4 independent checks from <a href="https://telegraphprotocol.com">Telegraph</a> (5 with a team name),
        audits them against free sources, and gives a LIST / CAUTION / REJECT verdict with every receipt and the exact cost.</p>
      <CheckForm />
    </>
  );
}
