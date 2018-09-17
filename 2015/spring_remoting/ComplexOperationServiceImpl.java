package com.cacoveanu.makeitso.remoting;

import com.sun.org.apache.xpath.internal.SourceTree;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Created by scacoveanu on 3/7/2015.
 */
@Component
public class ComplexOperationServiceImpl implements ComplexOperationService {

    private Thread thread;

    public ComplexOperationServiceImpl() {
        System.out.println("service initialized");
    }

    @Override
    public String sayHello(String name) {
        return "Hello, " + name + "!";
    }

    @Override
    public Long complexOperation(Long split) throws InterruptedException {
        final long cycles = (split == 0) ? Long.MAX_VALUE : (Long.MAX_VALUE / split);

        final AtomicLong result = new AtomicLong();
        thread = new Thread(new Runnable() {
            @Override
            public void run() {
                boolean interrupted = false;
                long startTime = System.currentTimeMillis();
                result.set(startTime);

                for (long i = 0; i < cycles; i++) {
                    result.set(System.currentTimeMillis());
                    if (Thread.interrupted()) {
                        interrupted = true;
                        break;
                    }
                }

                long time = result.longValue() - startTime;
                if (interrupted) {
                    System.out.println("interrupted after " + time + " ms");
                } else {
                    System.out.println("operation finished successfully after " + time + " ms");
                }
            }
        });
        thread.start();
        thread.join();
        return result.longValue();
    }

    @Override
    public void cancelComplexOperation() {
        thread.interrupt();
    }
}
