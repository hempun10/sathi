/**
 * Quote band — structure.json section `flex flex-col items-center justify-center
 * gap-8 w-full p-14 bg-accent z-20`: single blockquote with the SkyAgent
 * testimonial and Alex Johnson attribution. No motion wires in generation-plan.
 */
export default function Quote() {
  return (
    <section className="flex flex-col items-center justify-center gap-8 w-full p-14 bg-accent z-20">
      <blockquote className="max-w-3xl text-left px-4">
        <p className="text-xl md:text-2xl text-primary leading-relaxed tracking-tighter font-medium mb-6">
          I texted a link, granted Prava, and woke up to a receipt.
        </p>
        <div className="flex gap-4">
          <div className="size-10 rounded-full bg-primary border border-border">
            <img
              className="size-full rounded-full object-contain"
              src="/api/portraits/men/91.jpg"
              alt=""
            />
          </div>
          <div className="text-left">
            <cite className="text-lg font-medium text-primary not-italic">
              The job, in one loop
            </cite>
            <p className="text-sm text-primary">Sathi</p>
          </div>
        </div>
      </blockquote>
    </section>
  );
}
