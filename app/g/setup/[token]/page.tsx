import SetupForm from "./setup-form";

export default function SetupPage({ params }: { params: { token: string } }) {
  return <SetupForm token={params.token} />;
}
