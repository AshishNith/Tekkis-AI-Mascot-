import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Marquee } from '@/components/ui/3d-testimonails';

// PLACEHOLDER COPY: sample quotes for layout only. Replace with real, permissioned feedback before launch.
// Initials stand in for photos on purpose, so no one's picture is attached to a sample quote.
const testimonials = [
  { name: 'Alex M.', username: '@alex', role: 'Student', body: 'It gave me hints, not the answer. I actually learned the maths.' },
  { name: 'Priya S.', username: '@priya', role: 'Parent', body: 'Tutor mode and the PIN lock make it safe for my kid.' },
  { name: 'Jordan K.', username: '@jordan', role: 'Maker', body: 'It clicked through checkout while I kept coding.' },
  { name: 'Sam R.', username: '@sam', role: 'Shopper', body: 'I said what I wanted and it opened the second result.' },
  { name: 'Mina T.', username: '@mina', role: 'Designer', body: 'The first assistant that feels like it is in the room.' },
  { name: 'Leo B.', username: '@leo', role: 'Founder', body: 'We dropped the widget on our site in one line.' },
  { name: 'Nora W.', username: '@nora', role: 'Teacher', body: 'Interrupting it mid-sentence just works.' },
  { name: 'Omar H.', username: '@omar', role: 'Writer', body: 'It drafts the Gmail reply. I press send.' },
  { name: 'Chloe D.', username: '@chloe', role: 'Gamer', body: 'It beat me at tic-tac-toe, then fell asleep.' },
];

function TestimonialCard({ name, username, role, body }: (typeof testimonials)[number]) {
  return (
    <Card className="w-56 border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{name[0]}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col text-left">
            <figcaption className="flex items-center gap-1 text-sm font-medium text-foreground">
              {name} <span className="text-xs text-muted-foreground">{role}</span>
            </figcaption>
            <p className="text-xs font-medium text-muted-foreground">{username}</p>
          </div>
        </div>
        <blockquote className="mt-3 text-left text-sm text-secondary-foreground">{body}</blockquote>
      </CardContent>
    </Card>
  );
}

export default function Testimonials3D() {
  return (
    <div className="border-border relative mx-auto flex h-[460px] w-full max-w-[1100px] flex-row items-center justify-center gap-1.5 overflow-hidden rounded-lg border [perspective:300px]">
      <div
        className="flex flex-row items-center gap-4"
        style={{
          transform: 'translateX(-100px) translateY(0px) translateZ(-100px) rotateX(20deg) rotateY(-10deg) rotateZ(20deg)',
        }}
      >
        {/* Four vertical marquees, alternating direction */}
        <Marquee vertical pauseOnHover repeat={3} className="[--duration:40s]">
          {testimonials.map((review) => (
            <TestimonialCard key={review.username} {...review} />
          ))}
        </Marquee>
        <Marquee vertical pauseOnHover reverse repeat={3} className="[--duration:40s]">
          {testimonials.map((review) => (
            <TestimonialCard key={review.username} {...review} />
          ))}
        </Marquee>
        <Marquee vertical pauseOnHover repeat={3} className="[--duration:40s]">
          {testimonials.map((review) => (
            <TestimonialCard key={review.username} {...review} />
          ))}
        </Marquee>
        <Marquee vertical pauseOnHover reverse repeat={3} className="[--duration:40s]">
          {testimonials.map((review) => (
            <TestimonialCard key={review.username} {...review} />
          ))}
        </Marquee>
      </div>
      {/* Edge fades sit on the frame (not the tilted layer) so they line up with the border */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-linear-to-b from-background"></div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-background"></div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-linear-to-r from-background"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-linear-to-l from-background"></div>
    </div>
  );
}
